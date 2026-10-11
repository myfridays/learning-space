import type { Account, Env } from './types.ts';
import { HttpError, unauthorized } from './lib.ts';

export const COOKIE_NAME = 'ls_session';
const DEFAULT_SESSION_DAYS = 30;

export interface SessionPayload {
  sub: string;
  ver: number;
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

export async function createSessionToken(env: Env, user: Account): Promise<string> {
  const secret = signingSecret(env);
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: user.id,
    ver: user.session_version,
    iat: now,
    exp: now + sessionDays(env) * 24 * 60 * 60,
  };
  const encoded = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = bytesToBase64Url(await hmac(secret, encoded));
  return `${encoded}.${signature}`;
}

export async function verifySessionToken(env: Env, token: string): Promise<SessionPayload | null> {
  if (!token || !token.includes('.')) return null;
  if(token.split('.').length!==2)return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;

  const secret = signingSecret(env);
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
    if (typeof payload.sub !== 'string' || !Number.isInteger(payload.ver)) return null;
    return payload;
  } catch {
    return null;
  }
}

/* ── 密码校验 ──────────────────────────────────────────── */

function signingSecret(env: Env): string {
  if (!env.AUTH_SECRET) throw new HttpError(503,'请配置会话密钥','auth_not_configured');
  return env.AUTH_SECRET;
}

export async function hashPassword(password: string, salt = crypto.getRandomValues(new Uint8Array(16))): Promise<string> {
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  // Cloudflare Web Crypto supports up to 100,000 PBKDF2 iterations.
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:100000,hash:'SHA-256'},key,256);
  return `pbkdf2$100000$${bytesToBase64Url(salt)}$${bytesToBase64Url(new Uint8Array(bits))}`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts=stored.split('$');
  if(parts.length!==4 || parts[0]!=='pbkdf2'||parts[1]!=='100000')return false;
  try { return timingSafeEqual(new TextEncoder().encode(await hashPassword(password,base64UrlToBytes(parts[2]))),new TextEncoder().encode(stored)); } catch { return false; }
}
export async function checkPassword(env: Env, submitted: string): Promise<boolean> {
  if(!env.APP_PASSWORD)return false;
  return timingSafeEqual(await hmac(signingSecret(env),submitted),await hmac(signingSecret(env),env.APP_PASSWORD));
}
export function authEnabled(_env: Env): boolean { return true; }
export function publicAccount(user: Account) { return {id:user.id,username:user.username,role:user.role,disabled:Boolean(user.disabled)}; }
export async function currentUser(request: Request, env: Env): Promise<Account | null> {
  const token=getCookie(request,COOKIE_NAME);
  const payload=token?await verifySessionToken(env,token):null;
  if(!payload)return null;
  const user=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(payload.sub).first<Account>();
  return user&&!user.disabled&&user.session_version===payload.ver?user:null;
}

/* ── Cookie ────────────────────────────────────────────── */

export function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      try { return decodeURIComponent(part.slice(idx + 1).trim()); } catch { return null; }
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
 * 抛出 401 由 index.ts 统一处理；返回当前有效账号。
 */
export async function requireSession(request: Request, env: Env): Promise<Account> {
  const user=await currentUser(request,env);
  if(!user)throw unauthorized('请重新登录');
  return user;
}
