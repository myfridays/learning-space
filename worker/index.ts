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
import { HttpError, json, notFound, ok, readJson, str } from './lib.ts';
import {
  authEnabled,
  checkPassword,
  clearedSessionCookie,
  createSessionToken,
  getCookie,
  isSecureRequest,
  COOKIE_NAME,
  requireSession,
  sessionCookie,
  verifySessionToken,
} from './auth.ts';

import { registerNotes } from './routes/notes.ts';
import { registerTodos } from './routes/todos.ts';
import { registerHabits } from './routes/habits.ts';
import { registerDocuments } from './routes/documents.ts';
import { registerData } from './routes/data.ts';

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

router.get(
  '/api/auth/me',
  async ({ request, env }) => {
    const enabled = authEnabled(env);
    if (!enabled) return ok({ authEnabled: false, authenticated: true });

    const token = getCookie(request, COOKIE_NAME);
    const payload = token ? await verifySessionToken(env, token) : null;
    return ok({ authEnabled: true, authenticated: Boolean(payload) });
  },
  { auth: false },
);

router.post(
  '/api/auth/login',
  async ({ request, env }) => {
    const body = await readJson(request);
    const password = str(body.password, 'password', { max: 200, required: true });

    const passed = await checkPassword(env, password);
    if (!passed) {
      // 加一点延迟，抬高暴力破解成本
      await new Promise((resolve) => setTimeout(resolve, 400));
      throw new HttpError(401, '密码不正确', 'bad_credentials');
    }

    const token = await createSessionToken(env);
    const secure = isSecureRequest(request);
    return json(
      { ok: true, authenticated: true, authEnabled: authEnabled(env) },
      { headers: { 'set-cookie': sessionCookie(env, token, secure) } },
    );
  },
  { auth: false },
);

router.post(
  '/api/auth/logout',
  async ({ request }) =>
    json(
      { ok: true },
      { headers: { 'set-cookie': clearedSessionCookie(isSecureRequest(request)) } },
    ),
  { auth: false },
);

/* ── 业务接口（需要登录）──────────────────────────────── */

registerNotes(router);
registerTodos(router);
registerHabits(router);
registerDocuments(router);
registerData(router);

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
        await requireSession(request, env);
      }

      return await matched.route.handler({
        request,
        env,
        url,
        params: matched.params,
        method: request.method,
      });
    } catch (err) {
      return handleError(err);
    }
  },
};
