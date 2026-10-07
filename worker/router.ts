/**
 * 极简路由器（零依赖）
 * ------------------------------------------------------------------
 * 支持 /api/notes/:id 这样的路径参数，以及「路径匹配但方法不匹配」时
 * 返回 405 而不是 404。
 */

import type { Env } from './types.ts';

export interface Ctx {
  request: Request;
  env: Env;
  url: URL;
  params: Record<string, string>;
  method: string;
}

export type Handler = (ctx: Ctx) => Promise<Response> | Response;

export interface Route {
  method: string;
  segments: string[];
  handler: Handler;
  /** 是否需要登录。默认 true */
  auth: boolean;
}

export type MatchOutcome =
  | { kind: 'match'; route: Route; params: Record<string, string> }
  | { kind: 'method_mismatch' }
  | null;

export class Router {
  #routes: Route[] = [];

  add(method: string, pattern: string, handler: Handler, opts: { auth?: boolean } = {}): this {
    this.#routes.push({
      method: method.toUpperCase(),
      segments: pattern.split('/').filter(Boolean),
      handler,
      auth: opts.auth !== false, // 默认需要登录
    });
    return this;
  }

  get(pattern: string, handler: Handler, opts?: { auth?: boolean }) {
    return this.add('GET', pattern, handler, opts);
  }
  post(pattern: string, handler: Handler, opts?: { auth?: boolean }) {
    return this.add('POST', pattern, handler, opts);
  }
  patch(pattern: string, handler: Handler, opts?: { auth?: boolean }) {
    return this.add('PATCH', pattern, handler, opts);
  }
  put(pattern: string, handler: Handler, opts?: { auth?: boolean }) {
    return this.add('PUT', pattern, handler, opts);
  }
  delete(pattern: string, handler: Handler, opts?: { auth?: boolean }) {
    return this.add('DELETE', pattern, handler, opts);
  }

  match(method: string, pathname: string): MatchOutcome {
    const parts = pathname.split('/').filter(Boolean);
    let pathMatched = false;

    for (const route of this.#routes) {
      if (route.segments.length !== parts.length) continue;

      const params: Record<string, string> = {};
      let matched = true;
      for (let i = 0; i < parts.length; i++) {
        const seg = route.segments[i];
        if (seg.startsWith(':')) {
          params[seg.slice(1)] = decodeURIComponent(parts[i]);
        } else if (seg !== parts[i]) {
          matched = false;
          break;
        }
      }
      if (!matched) continue;

      pathMatched = true;
      if (route.method === method) {
        return { kind: 'match', route, params };
      }
    }

    return pathMatched ? { kind: 'method_mismatch' } : null;
  }
}
