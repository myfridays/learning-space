/**
 * 认证：单用户密码 + HMAC 签名 Cookie
 * ------------------------------------------------------------------
 * 零依赖，全部用 Web Crypto 实现。
 *
 * 会话令牌格式：  base64url(payload) + "." + base64url(HMAC-SHA256(payload))
 * 存放位置：      HttpOnly Cookie，JS 读不到，能防 XSS 窃取
 *
 * 如果环境变量 APP_PASSWORD 没有设置，则关闭登录校验（方便纯本地开发）。
 * 一旦设置了 APP_PASSWORD，所有 /api/* 接口（除登录相关）都需要有效会话。
 */

import type { Env } from './types.ts';
import { unauthorized } from './lib.ts';

export const COOKIE_NAME = 'ls_session';
const DEFAULT_SESSION_DAYS = 30;

export interface SessionPayload {
  sub: string;
  iat: number;
  exp: number;
}

/* ── 编码工具 ──────────────────────────────────────────── */

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return new Uint8Array(signature);
}

/* ── 会话令牌 ──────────────────────────────────────────── */

function sessionDays(env: Env): number {
  const raw = Number(env.SESSION_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_SESSION_DAYS;
}

export async function createSessionToken(env: Env): Promise<string> {
  const secret = env.AUTH_SECRET || 'insecure-dev-secret';
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: 'owner',
    iat: now,
    exp: now + sessionDays(env) * 24 * 60 * 60,
  };
  const encoded = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = bytesToBase64Url(await hmac(secret, encoded));
  return `${encoded}.${signature}`;
}

export async function verifySessionToken(env: Env, token: string): Promise<SessionPayload | null> {
  if (!token || !token.includes('.')) return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;

  const secret = env.AUTH_SECRET || 'insecure-dev-secret';
  const expected = await hmac(secret, encoded);

  let provided: Uint8Array;
  try {
    provided = base64UrlToBytes(signature);
  } catch {
    return null;
  }
  if (!timingSafeEqual(expected, provided)) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encoded))) as SessionPayload;
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null;
    if (payload.sub !== 'owner') return null;
    return payload;
  } catch {
    return null;
  }
}

/* ── 密码校验 ──────────────────────────────────────────── */

/** 用常量时间比较，避免通过响应时间推测密码 */
export async function checkPassword(env: Env, submitted: string): Promise<boolean> {
  const expected = env.APP_PASSWORD;
  if (!expected) return true; // 未设置密码 = 不校验
  const secret = env.AUTH_SECRET || 'insecure-dev-secret';
  const a = await hmac(secret, submitted);
  const b = await hmac(secret, expected);
  return timingSafeEqual(a, b);
}

/** 是否启用了登录校验 */
export function authEnabled(env: Env): boolean {
  return Boolean(env.APP_PASSWORD);
}

/* ── Cookie ────────────────────────────────────────────── */

export function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

export function serializeCookie(
  name: string,
  value: string,
  opts: { maxAge?: number; secure?: boolean } = {},
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  // 本地 http://localhost 下不能带 Secure，否则浏览器不保存
  if (opts.secure) parts.push('Secure');
  return parts.join('; ');
}

export function sessionCookie(env: Env, token: string, secure: boolean): string {
  return serializeCookie(COOKIE_NAME, token, {
    maxAge: sessionDays(env) * 24 * 60 * 60,
    secure,
  });
}

export function clearedSessionCookie(secure: boolean): string {
  return serializeCookie(COOKIE_NAME, '', { maxAge: 0, secure });
}

/* ── 请求级校验 ────────────────────────────────────────── */

export function isSecureRequest(request: Request): boolean {
  return new URL(request.url).protocol === 'https:';
}

/**
 * 校验当前请求是否已登录。
 * 抛出 401 由 index.ts 统一处理；返回 true 表示通过。
 */
export async function requireSession(request: Request, env: Env): Promise<boolean> {
  if (!authEnabled(env)) return true;
  const token = getCookie(request, COOKIE_NAME);
  if (!token) throw unauthorized('未登录');
  const payload = await verifySessionToken(env, token);
  if (!payload) throw unauthorized('登录已过期，请重新登录');
  return true;
}
