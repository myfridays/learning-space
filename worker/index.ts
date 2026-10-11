/**
 * Worker 入口
 * ------------------------------------------------------------------
 * 职责：
 *   1. 分派 /api/* 到具体路由
 *   2. 认证网关（除登录/健康检查外，全部需要会话）
 *   3. 统一错误处理，永远返回 JSON 而不是 HTML 错误页
 *   4. 非 /api/ 请求交给静态资源绑定（ASSETS）
 */

import type { Env } from './types.ts';
import { Router } from './router.ts';
import { HttpError, json, notFound, ok } from './lib.ts';
import { authEnabled, requireSession } from './auth.ts';
import { registerAccounts } from './routes/accounts.ts';

import { registerNotes } from './routes/notes.ts';
import { registerTodos } from './routes/todos.ts';
import { registerHabits } from './routes/habits.ts';
import { registerDocuments } from './routes/documents.ts';
import { registerData } from './routes/data.ts';

import { registerLife } from './routes/life.ts';
import { registerWeather } from './routes/weather.ts';

const router = new Router();

/* ── 认证相关（无需登录）──────────────────────────────── */

router.get(
  '/api/health',
  async ({ env }) =>
    ok({
      ok: true,
      app: 'learning-space',
      time: new Date().toISOString(),
      authEnabled: authEnabled(env),
      database: Boolean(env.DB),
      storage: Boolean(env.BUCKET),
    }),
  { auth: false },
);

registerAccounts(router);

/* ── 业务接口（需要登录）──────────────────────────────── */

registerNotes(router);
registerTodos(router);
registerHabits(router);
registerDocuments(router);
registerData(router);
registerLife(router);
registerWeather(router);

/* ── 错误处理 ─────────────────────────────────────────── */

function handleError(err: unknown): Response {
  if (err instanceof HttpError) {
    return json({ error: err.message, code: err.code }, { status: err.status });
  }

  console.error('[learning-space] 未处理的异常:', err);
  const message = err instanceof Error ? err.message : String(err);
  return json(
    { error: '服务器内部错误', code: 'internal_error', detail: message },
    { status: 500 },
  );
}

/* ── 入口 ─────────────────────────────────────────────── */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Public feed URLs use the current subdomain when blog.config.json has no URL yet.
    if (['/feed.xml', '/sitemap.xml', '/robots.txt'].includes(url.pathname) && env.ASSETS) {
      if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method Not Allowed', { status: 405 });
      const response = await env.ASSETS.fetch(new Request(request.url, { method: 'GET' }));
      if (!response.ok) return response;
      const origin = url.origin.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
      const body = (await response.text()).replaceAll('__BLOG_ORIGIN__', origin);
      return new Response(request.method === 'HEAD' ? null : body, { headers: {
        'content-type': url.pathname.endsWith('.xml') ? 'application/xml; charset=utf-8' : 'text/plain; charset=utf-8',
        'cache-control': 'no-cache',
      } });
    }

    // 非 API 请求交给静态资源
    if (!url.pathname.startsWith('/api/')) {
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response('Not Found', { status: 404 });
    }

    try {
      const matched = router.match(request.method, url.pathname);

      if (!matched) {
        throw notFound(`未知接口：${request.method} ${url.pathname}`);
      }
      if (matched.kind === 'method_mismatch') {
        throw new HttpError(
          405,
          `${url.pathname} 不支持 ${request.method} 方法`,
          'method_not_allowed',
        );
      }

      if (matched.route.auth) {
        const user = await requireSession(request, env);
        if(request.headers.get('X-Space-User') && request.headers.get('X-Space-User')!==user.id)throw new HttpError(409,'账号已切换，请刷新页面','account_changed');
        env = { ...env, USER: user };
      }

      if (!['GET','HEAD'].includes(request.method)) {
        const origin=request.headers.get('origin');
        if(origin && origin!==url.origin)throw new HttpError(403,'请求来源无效','forbidden');
      }
      const response = await matched.route.handler({
        request,
        env,
        url,
        params: matched.params,
        method: request.method,
      });
      const headers=new Headers(response.headers);headers.set('cache-control','no-store');
      return new Response(response.body,{status:response.status,headers});
    } catch (err) {
      return handleError(err);
    }
  },
};
