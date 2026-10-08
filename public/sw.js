/**
 * Service Worker
 * ------------------------------------------------------------------
 * 策略（针对「数据必须是最新的」这个要求专门设计）：
 *   · /api/*  → 完全不拦截，永远走网络。绝不缓存任何接口响应。
 *   · 导航请求 → 网络优先，断网时回退到缓存的 index.html
 *   · 静态资源 → 缓存优先 + 后台更新（stale-while-revalidate）
 *
 * ⚠️ v2 加了「内容类型校验」：
 *   如果某个 .js 请求拿到的是 text/html（说明服务端返回了 HTML 错误页），
 *   就绝对不写进缓存。否则这个错误的响应会被永久缓存下来，
 *   导致明明修好了部署，浏览器还是一直白屏。
 */

const CACHE_NAME = 'learning-space-v6-pet-dock';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.css',
  '/icon.svg',
  '/icon-maskable.svg',
  '/manifest.webmanifest',
  '/js/app.js',
  '/js/cosmos.js',
  '/js/pet.js',
  '/pet/dafeiyu/front.png',
  '/pet/dafeiyu/side.png',
  '/pet/dafeiyu/back.png',
  '/js/api.js',
  '/js/util.js',
  '/js/components.js',
  '/js/markdown.js',
  '/js/views/login.js',
  '/js/views/dashboard.js',
  '/js/views/notes.js',
  '/js/views/todos.js',
  '/js/views/habits.js',
  '/js/views/files.js',
  '/js/views/settings.js',
];

/** 期望的 Content-Type，用来挡住「把 HTML 错误页缓存成 JS」这种事故 */
function expectedType(pathname) {
  if (pathname === '/' || pathname.endsWith('.html')) return 'html';
  if (pathname.endsWith('.js')) return 'javascript';
  if (pathname.endsWith('.css')) return 'css';
  if (pathname.endsWith('.webmanifest')) return 'json';
  if (pathname.endsWith('.svg')) return 'svg';
  return null;
}

function typeMatches(pathname, response) {
  const want = expectedType(pathname);
  if (!want) return true;
  const got = (response.headers.get('content-type') || '').toLowerCase();
  if (want === 'json') return got.includes('json');
  return got.includes(want);
}

function isCacheable(pathname, response) {
  if (!response || !response.ok) return false;
  if (response.status !== 200) return false;
  return typeMatches(pathname, response);
}

/* ── 安装：逐个预缓存，单个失败不影响整体 ─────────────── */

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const results = await Promise.all(
        STATIC_ASSETS.map(async (path) => {
          try {
            const response = await fetch(path, { cache: 'reload' });
            if (!isCacheable(new URL(path, self.location.origin).pathname, response)) {
              console.warn('[sw] 跳过缓存（类型不对或状态异常）:', path, response.status, response.headers.get('content-type'));
              return false;
            }
            await cache.put(path, response);
            return true;
          } catch (err) {
            console.warn('[sw] 预缓存失败:', path, err);
            return false;
          }
        }),
      );
      const ok = results.filter(Boolean).length;
      console.log(`[sw] 预缓存完成：${ok}/${STATIC_ASSETS.length}`);
      await self.skipWaiting();
    })(),
  );
});

/* ── 激活：清掉所有旧版本缓存 ─────────────────────────── */

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/* ── 取用 ─────────────────────────────────────────────── */

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 只处理同源的 GET 请求
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // ★ 接口一律不拦截，直接走网络，保证数据永远是最新的
  if (url.pathname.startsWith('/api/')) return;

  // 页面导航：网络优先，离线时用缓存的壳
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/index.html').then((r) => r ?? Response.error()),
      ),
    );
    return;
  }

  // 静态资源：先给缓存的，同时后台更新
  event.respondWith(
    caches.match(request).then((cached) => {
      // 缓存里如果躺着类型不对的东西（老版本留下的脏数据），直接丢掉重新拉
      if (cached && !typeMatches(url.pathname, cached)) {
        caches.delete(request);
        cached = null;
      }

      const network = fetch(request)
        .then((response) => {
          if (isCacheable(url.pathname, response)) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          } else if (response && response.ok) {
            console.warn('[sw] 响应类型不符，不缓存:', url.pathname, response.headers.get('content-type'));
          }
          return response;
        })
        .catch(() => cached);

      return cached || network;
    }),
  );
});
