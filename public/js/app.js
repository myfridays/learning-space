/**
 * 应用入口：路由、外壳、主题
 * ------------------------------------------------------------------
 * 采用 hash 路由（#/notes/xxx）而不是 history 路由，原因：
 *   1. 不需要服务器做任何 rewrite 配置，部署更省心
 *   2. 深度链接刷新时不会 404
 */

import { api, setApiAccount } from './api.js';
import { initPet } from './pet.js';
import { $, readStored, toast, writeStored, setStorageUser } from './util.js';

import { loginView } from './views/login.js';
import { villageView } from './views/village.js';
import { lifeView } from './views/life.js';
import { fitnessView } from './views/fitness.js';
import { todayView } from './views/today.js';
import { pixelSettingsView } from './views/pixel-settings.js';
import { noteEditorView, notesListView } from './views/notes.js';
import { habitsView } from './views/habits.js';
import { filesView } from './views/files.js';

const NAV = [
  { hash: '#/', label: '首页', icon: 'square', match: p => p.length === 0 },
  { hash: '#/mindfulness', label: '正念', icon: 'mindfulness', match: p => p[0] === 'mindfulness' },
  { hash: '#/fitness', label: '健身', icon: 'fitness', match: p => p[0] === 'fitness' },
  { hash: '#/todos', label: '待办', icon: 'todos', match: p => p[0] === 'todos' },
  { hash: '#/settings', label: '设置', icon: 'settings', match: p => p[0] === 'settings' },
];

const SUN_ICON = `<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.4M12 19.6V22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2 12h2.4M19.6 12H22M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7"/>`;
const MOON_ICON = `<path d="M20.5 14.3A8.4 8.4 0 0 1 9.7 3.5a8.4 8.4 0 1 0 10.8 10.8Z"/>`;

/* ══════════════════════════════════════════════════════════
   主题
   ══════════════════════════════════════════════════════════ */

const media = window.matchMedia('(prefers-color-scheme: dark)');
let themeMode = readStored('theme-mode', 'dark');

function effectiveTheme() {
  if (themeMode === 'auto') return media.matches ? 'dark' : 'light';
  return themeMode;
}

let themeListenerBound = false;

function applyTheme() {
  const theme = effectiveTheme();
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;

  const icon = $('#themeIcon');
  if (icon) icon.innerHTML = theme === 'dark' ? SUN_ICON : MOON_ICON;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#080d24' : '#eaf0ff');

  if (!themeListenerBound) {
    themeListenerBound = true;
    media.addEventListener('change', () => {
      if (themeMode === 'auto') applyTheme();
    });
  }
}

/* ══════════════════════════════════════════════════════════
   应用对象
   ══════════════════════════════════════════════════════════ */

const app = {
  /** bootstrap 数据缓存 */
  data: null,
  /** 离开当前页面前需要执行的收尾动作（比如笔记编辑器把未保存的内容存掉） */
  leaveGuard: null,
  shellReady: false,

  async getBootstrap(force = false) {
    if (force || !this.data) {
      this.data = await api.bootstrap();
    }
    return this.data;
  },

  invalidate() {
    this.data = null;
  },

  setLeaveGuard(fn) {
    this.leaveGuard = fn;
  },

  clearLeaveGuard() {
    this.leaveGuard = null;
  },

  setThemeMode(mode) {
    themeMode = mode;
    writeStored('theme-mode', mode);
    applyTheme();
  },

  toggleTheme() {
    this.setThemeMode(effectiveTheme() === 'dark' ? 'light' : 'dark');
  },

  navigate(hash) {
    if (location.hash === hash) {
      renderRoute();
    } else {
      location.hash = hash;
    }
  },

  /** 登录成功后进入主界面 */
  async start() {
    renderShell();
    updateNav();
    await renderRoute();
  },
};

/* ══════════════════════════════════════════════════════════
   外壳
   ══════════════════════════════════════════════════════════ */

function renderShell() {
  $('#app').innerHTML = `
    <header class="topbar">
      <div class="topbar__inner">
        <a class="brand" href="#/">
          <img class="pixel-brand" src="/village/buildings/square.png" alt="">
          <span class="brand__text">生活村庄</span>
        </a>
        <nav class="nav" id="nav">
          ${NAV.map(
            (item) =>
              `<a class="nav__link" href="${item.hash}" data-nav="${item.hash}">${item.label}</a>`,
          ).join('')}
        </nav>
        <div class="topbar__tools"><a href="/" title="返回公开博客">博客 ↗</a>
          <button class="icon-btn" id="themeBtn" title="切换深浅色" aria-label="切换深浅色">
            <svg id="themeIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></svg>
          </button>
        </div>
      </div>
    </header>

    <main id="view"></main>

    <nav class="mobile-nav">
      <div class="mobile-nav__inner">
        ${NAV.map(
          (item) =>
            `<a class="mobile-nav__link" href="${item.hash}" data-nav="${item.hash}">
               <img src="/village/buildings/${item.icon}.png" alt=""><span>${item.label}</span>
             </a>`,
        ).join('')}
      </div>
    </nav>`;

  app.shellReady = true;
  applyTheme();

  $('#themeBtn').addEventListener('click', () => app.toggleTheme());
}

function currentParts() {
  return (location.hash || '#/').replace(/^#\/?/, '').split('/').filter(Boolean);
}

function updateNav() {
  const parts = currentParts();
  document.querySelectorAll('[data-nav]').forEach((link) => {
    const item = NAV.find((n) => n.hash === link.dataset.nav);
    link.classList.toggle('is-active', Boolean(item && item.match(parts)));
  });
}

/* ══════════════════════════════════════════════════════════
   路由
   ══════════════════════════════════════════════════════════ */

let renderToken = 0;

async function renderRoute() {
  const view = $('#view');
  if (!view) return;

  const token = ++renderToken;
  const parts = currentParts();

  // 执行上一个页面注册的收尾动作（例如把未保存的笔记存掉）
  if (app.leaveGuard) {
    const guard = app.leaveGuard;
    app.leaveGuard = null;
    try {
      await guard();
    } catch (err) {
      console.warn('离开页面时的收尾动作失败:', err);
    }
  }

  // 收尾动作可能是异步的，期间用户又点了别的地方，这一轮就作废
  if (token !== renderToken) return;

  view.innerHTML = '<div class="page"><div class="skeleton" style="height:180px"></div></div>';

  try {
    const [first, second] = parts;

    if (!first) {
      await villageView(view, app);
    } else if (first === 'mindfulness' || first === 'fitness') {
      if (first === 'fitness') await fitnessView(view, app);
      else await lifeView(view, app, first);
    } else if (first === 'notes' && !second) {
      await notesListView(view, app);
    } else if (first === 'notes' && second) {
      await noteEditorView(view, app, second);
    } else if (first === 'todos') {
      await todayView(view, app);
    } else if (first === 'habits') {
      await habitsView(view, app);
    } else if (first === 'files') {
      await filesView(view, app, second || null);
    } else if (first === 'settings') {
      await pixelSettingsView(view, app);
    } else {
      view.innerHTML = `<div class="page"><div class="empty">
        <div class="empty__icon">🧭</div>
        <div class="empty__title">页面不存在</div>
        <div class="empty__hint">地址是 ${location.hash}</div>
      </div><div style="text-align:center"><a class="btn" href="#/">回到首页</a></div></div>`;
    }
  } catch (err) {
    if (token !== renderToken) return;
    console.error(err);

    // 会话过期 → 回到登录页
    if (err.status === 401) {
      location.reload();
      return;
    }

    view.innerHTML = `<div class="page"><div class="empty">
      <div class="empty__icon">⚠️</div>
      <div class="empty__title">加载失败</div>
      <div class="empty__hint">${err.message}</div>
    </div><div style="text-align:center">
      <button class="btn btn--primary" id="retryBtn">重试</button>
      <a class="btn" href="#/">回到首页</a>
    </div></div>`;
    view.querySelector('#retryBtn')?.addEventListener('click', () => renderRoute());
  }
}

/* ══════════════════════════════════════════════════════════
   启动
   ══════════════════════════════════════════════════════════ */

async function boot() {
  applyTheme();

  // Bind before authentication so navigation also works immediately after login.
  window.addEventListener('hashchange', () => {
    if (!app.shellReady) return;
    updateNav();
    renderRoute();
  });

  const root = $('#app');

  try {
    const me = await api.me();

    if (me.authEnabled && !me.authenticated) {
      initPet();
      loginView(root, app);
      return;
    }

    app.user=me.user;
    if(me.user) {
      setApiAccount(me.user.id);
      const migrated=setStorageUser(me.user.id,me.preferences||{});
      if(Object.keys(migrated).length)await api.preferences(migrated).catch(()=>toast('旧偏好未同步，可在设置中重新保存'));
      themeMode=readStored('theme-mode','dark');applyTheme();
    }
    initPet();
    await app.start();

  } catch (err) {
    console.error(err);
    root.innerHTML = `<div class="login-wrap"><div class="login">
      <div class="login__mark">⚠️</div>
      <h1 class="login__title">无法连接</h1>
      <p class="login__sub">${err.message}</p>
      <button class="btn btn--primary btn--block" id="reloadBtn">重试</button>
    </div></div>`;
    root.querySelector('#reloadBtn')?.addEventListener('click', () => location.reload());
  }
}

/* 全局快捷键 */
document.addEventListener('keydown', (event) => {
  if (event.key !== 'k' || !(event.ctrlKey || event.metaKey)) return;
  const search = document.querySelector('#searchInput');
  if (search) {
    event.preventDefault();
    search.focus();
    return;
  }
  if (location.hash !== '#/notes') {
    event.preventDefault();
    location.hash = '#/notes';
    setTimeout(() => document.querySelector('#searchInput')?.focus(), 120);
  }
});

let preferenceQueue=Promise.resolve();
window.addEventListener('preference-change',event=>{
  preferenceQueue=preferenceQueue.catch(()=>{}).then(()=>api.preferences(event.detail)).catch(()=>toast('偏好设置未同步，请稍后重试'));
});
window.addEventListener('session-expired',()=>location.reload());
window.addEventListener('storage',event=>{if(event.key==='space-session-change')location.reload();});
boot();
