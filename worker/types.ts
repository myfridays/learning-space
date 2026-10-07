/**
 * 类型定义
 * ------------------------------------------------------------------
 * 这里手写 D1 / R2 的最小接口，而不是依赖 @cloudflare/workers-types，
 * 目的是让整个项目做到「零 npm 依赖」，拉下来就能跑。
 *
 * 如果你想要更完整的官方类型，可以自行安装：
 *   npm i -D @cloudflare/workers-types
 * 然后把下面这些接口换成官方的 D1Database / R2Bucket 即可。
 */

export interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: Record<string, unknown>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
  raw<T = unknown>(options?: { columnNames?: boolean }): Promise<T[]>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<{ count: number; duration: number }>;
}

export interface R2ObjectMeta {
  key: string;
  size: number;
  etag: string;
  uploaded: Date;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
}

export interface R2ObjectBody extends R2ObjectMeta {
  body: ReadableStream;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
  json<T = unknown>(): Promise<T>;
  writeHttpMetadata(headers: Headers): void;
}

export type R2PutValue =
  | string
  | ArrayBuffer
  | ArrayBufferView
  | ReadableStream
  | Blob
  | null;

export interface R2Bucket {
  put(
    key: string,
    value: R2PutValue,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<R2ObjectMeta | null>;
  get(key: string, options?: unknown): Promise<R2ObjectBody | null>;
  head(key: string): Promise<R2ObjectMeta | null>;
  delete(key: string | string[]): Promise<void>;
  list(options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ objects: R2ObjectMeta[]; truncated: boolean; cursor?: string }>;
}

/** 静态资源绑定（wrangler.jsonc 里的 assets.binding = "ASSETS"） */
export interface Fetcher {
  fetch(request: Request | string, init?: RequestInit): Promise<Response>;
}

export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS?: Fetcher;

  /** 登录密码。不设置则关闭登录校验（仅建议纯本地开发时这样） */
  APP_PASSWORD?: string;
  /** 会话签名密钥 */
  AUTH_SECRET?: string;
  /** 文档总容量上限（字节） */
  STORAGE_QUOTA_BYTES?: string;
  /** 会话有效期（天） */
  SESSION_DAYS?: string;
}

/** 数据行类型 */

export interface NoteRow {
  id: string;
  title: string;
  content: string;
  tags: string;
  pinned: number;
  created_at: string;
  updated_at: string;
}

export interface TodoRow {
  id: string;
  title: string;
  detail: string;
  priority: string;
  done: number;
  due_date: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  done_at: string | null;
}

export interface HabitRow {
  id: string;
  name: string;
  icon: string;
  color: string;
  active: number;
  sort_order: number;
  created_at: string;
}

export interface HabitLogRow {
  habit_id: string;
  day: string;
  count: number;
  note: string;
  updated_at: string;
}

export interface DocumentRow {
  id: string;
  name: string;
  size_bytes: number;
  content_type: string;
  r2_key: string;
  created_at: string;
  last_page: number;
  total_pages: number | null;
  opened_at: string | null;
}
