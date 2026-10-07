/**
 * 通用工具：JSON 响应、错误、参数校验、ID、时间
 * ------------------------------------------------------------------
 * 零依赖，全部基于 Web 标准 API（Workers 和 Node 24 都原生支持）。
 */

/** 业务错误。抛出后会被 index.ts 统一转成 JSON 响应 */
export class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code = 'error') {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export function badRequest(message: string, code = 'bad_request'): HttpError {
  return new HttpError(400, message, code);
}

export function unauthorized(message = '请先登录'): HttpError {
  return new HttpError(401, message, 'unauthorized');
}

export function notFound(message = '资源不存在'): HttpError {
  return new HttpError(404, message, 'not_found');
}

/** 统一的 JSON 响应。API 响应一律禁止缓存，避免读到旧数据 */
export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function ok(data: unknown = { ok: true }): Response {
  return json(data, { status: 200 });
}

/** 生成唯一 ID（Workers 和 Node 都有 crypto.randomUUID） */
export function newId(prefix = ''): string {
  return prefix + crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** 安全地解析请求体 JSON */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text || !text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw badRequest('请求体必须是一个 JSON 对象');
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw badRequest('请求体不是合法的 JSON');
  }
}

/** 取字符串字段 */
export function str(
  value: unknown,
  field: string,
  opts: { max?: number; required?: boolean; def?: string } = {},
): string {
  const { max = 100_000, required = false, def = '' } = opts;
  if (value === undefined || value === null) {
    if (required) throw badRequest(`缺少字段 ${field}`);
    return def;
  }
  if (typeof value !== 'string') throw badRequest(`字段 ${field} 必须是字符串`);
  if (required && value.trim() === '') throw badRequest(`字段 ${field} 不能为空`);
  if (value.length > max) throw badRequest(`字段 ${field} 超出长度上限（${max}）`);
  return value;
}

/** 取整数字段 */
export function int(
  value: unknown,
  field: string,
  opts: { min?: number; max?: number; def?: number } = {},
): number {
  const { min = -Infinity, max = Infinity, def = 0 } = opts;
  if (value === undefined || value === null || value === '') return def;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) throw badRequest(`字段 ${field} 必须是数字`);
  const i = Math.trunc(n);
  if (i < min || i > max) throw badRequest(`字段 ${field} 超出范围 [${min}, ${max}]`);
  return i;
}

/** 取布尔字段（接受 true/false、1/0、"true"/"false"） */
export function bool(value: unknown, field: string, def = false): boolean {
  if (value === undefined || value === null) return def;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const v = value.toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(v)) return true;
    if (['false', '0', 'no', 'off', ''].includes(v)) return false;
  }
  throw badRequest(`字段 ${field} 必须是布尔值`);
}

/** 校验并归一化 YYYY-MM-DD 日期字符串 */
export function dateOnly(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  const s = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw badRequest(`字段 ${field} 必须是 YYYY-MM-DD 格式`);
  }
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw badRequest(`字段 ${field} 不是一个真实存在的日期`);
  }
  return s;
}

/** 校验标签数组，存成 JSON 字符串 */
export function tags(value: unknown, field = 'tags'): string {
  if (value === undefined || value === null) return '[]';
  if (!Array.isArray(value)) throw badRequest(`字段 ${field} 必须是数组`);
  if (value.length > 50) throw badRequest(`字段 ${field} 最多 50 个标签`);

  const cleaned: string[] = [];
  for (const item of value) {
    // 去掉引号和反斜杠：标签里本来也不该有，去掉之后
    // 后端用 tags LIKE '%"标签"%' 匹配才不会出意外
    const tag = String(item).replace(/[\\"]/g, '').trim();
    if (tag.length > 0 && tag.length <= 40) cleaned.push(tag);
  }
  return JSON.stringify([...new Set(cleaned)]);
}

/** 安全的 JSON 解析，失败时返回兜底值 */
export function safeParse<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/**
 * 从 URL 查询参数里读取分页。
 * 默认 limit=200，最大 1000，防止一次拉爆 D1 的读取额度。
 */
export function pagination(url: URL, defaultLimit = 200): { limit: number; offset: number } {
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? defaultLimit) || defaultLimit, 1), 1000);
  const offset = Math.max(Number(url.searchParams.get('offset') ?? 0) || 0, 0);
  return { limit, offset };
}

/** 人类可读的字节数 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

/** 截断文本，用于生成摘要 */
export function excerpt(text: string, max = 90): string {
  const flat = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*`_\-[\]()!]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length <= max ? flat : flat.slice(0, max) + '…';
}
