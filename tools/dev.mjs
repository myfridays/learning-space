/**
 * 本地开发服务器（零依赖）
 * ------------------------------------------------------------------
 * 不开 wrangler，直接用 Node 内置能力模拟 Cloudflare Workers 运行环境：
 *   · D1      → .local/db.sqlite（真实 SQLite 文件）
 *   · R2      → .local/r2/（真实文件目录）
 *   · ASSETS  → public/ 目录
 *
 * 用法：node tools/dev.mjs  （或 npm run dev）
 * 然后浏览器打开 http://127.0.0.1:8787
 *
 * 为什么要有这个：沙箱/离线环境下 wrangler 装不上，而且这样启动只要
 * 几十毫秒。线上部署依然用 wrangler，两者行为对齐。
 */

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, dirname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';

import { createD1, applyMigrations } from './lib/d1.mjs';
import { createR2 } from './lib/r2.mjs';
import { loadDevVars, loadWranglerVars } from './lib/env.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'public');
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';

/* ── 静态资源 MIME ─────────────────────────────────────── */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/** 模拟 Cloudflare 的 ASSETS 绑定 */
const assetsBinding = {
  async fetch(request) {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/' || pathname.endsWith('/')) pathname += 'index.html';

    const safe = normalize(pathname).replace(/^([/\\])+/, '');
    const filePath = join(publicDir, safe);
    if (!filePath.startsWith(publicDir + sep) && filePath !== publicDir) {
      return new Response('Forbidden', { status: 403 });
    }

    try {
      const data = await readFile(filePath);
      return new Response(data, {
        status: 200,
        headers: {
          'content-type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
          'cache-control': 'no-store',
        },
      });
    } catch {
      return new Response('Not Found', { status: 404 });
    }
  },
};

/* ── 环境准备 ─────────────────────────────────────────── */

const db = createD1(join(root, '.local', 'db.sqlite'));
const applied = applyMigrations(db, join(root, 'migrations'));
const bucket = createR2(join(root, '.local', 'r2'));

const vars = { ...loadWranglerVars(root), ...loadDevVars(root) };
const env = { DB: db, BUCKET: bucket, ASSETS: assetsBinding, ...vars };

const worker = (await import(pathToFileURL(join(root, 'worker', 'index.ts')).href)).default;

/* ── HTTP 服务 ────────────────────────────────────────── */

const NO_BODY_METHODS = new Set(['GET', 'HEAD']);

function toWebRequest(req) {
  const host = req.headers.host || `127.0.0.1:${PORT}`;
  const url = new URL(req.url, `http://${host}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else headers.set(key, value);
  }

  const init = { method: req.method, headers };
  if (!NO_BODY_METHODS.has(req.method)) {
    init.body = Readable.toWeb(req);
    init.duplex = 'half';
  }
  return new Request(url, init);
}

async function writeWebResponse(res, response) {
  const headers = {};
  for (const [key, value] of response.headers) {
    if (key.toLowerCase() === 'set-cookie') continue;
    headers[key] = value;
  }

  // 注意顺序：set-cookie 必须在 writeHead 之前设置，
  // 否则头已经发出去了，再 setHeader 会抛
  // "Cannot set headers after they are sent to the client"
  const cookies =
    typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  if (cookies.length > 0) res.setHeader('set-cookie', cookies);

  res.writeHead(response.status, headers);

  if (!response.body) {
    res.end();
    return;
  }
  Readable.fromWeb(response.body).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  let status = 500;
  try {
    const request = toWebRequest(req);
    const response = await worker.fetch(request, env, {});
    status = response.status;
    await writeWebResponse(res, response);
  } catch (err) {
    status = 500;
    console.error('[dev] 处理请求出错:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: String(err?.message ?? err) }));
    } else {
      res.end();
    }
  } finally {
    const ms = Date.now() - started;
    const mark = status >= 500 ? '✖' : status >= 400 ? '▲' : '·';
    console.log(`${mark} ${String(status).padEnd(3)} ${String(ms).padStart(4)}ms  ${req.method} ${req.url}`);
  }
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  📚 学习空间 · 本地开发服务器');
  console.log('  ─────────────────────────────────────────────');
  console.log(`  地址      http://${HOST}:${PORT}`);
  console.log(`  数据库    .local/db.sqlite`);
  console.log(`  文件存储  .local/r2/`);
  console.log(`  迁移      ${applied.join(', ')}`);
  console.log(`  登录校验  ${vars.APP_PASSWORD ? '已开启（需要密码）' : '已关闭（APP_PASSWORD 未设置）'}`);
  console.log('  ─────────────────────────────────────────────');
  console.log('  按 Ctrl+C 停止');
  console.log('');
});

function shutdown() {
  console.log('\n正在关闭…');
  server.close(() => {
    try {
      db.close();
    } catch {
      /* 忽略 */
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
