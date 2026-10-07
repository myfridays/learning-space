/** 文档（PDF 等）接口 —— 文件本体存 R2，数据库只存元数据 */

import type { Router } from '../router.ts';
import { HttpError, badRequest, int, json, newId, notFound, ok, readJson, str } from '../lib.ts';
import {
  createDocument,
  deleteDocument,
  getDocumentRow,
  listDocuments,
  storageUsed,
  updateDocument,
} from '../db.ts';

const DEFAULT_QUOTA = 8 * 1024 * 1024 * 1024; // 8 GiB

/** 允许上传的类型。故意做白名单，避免把站点变成任意文件托管 */
const ALLOWED_PREFIXES = ['application/pdf', 'image/', 'text/', 'audio/', 'video/'];
const ALLOWED_EXTENSIONS = [
  '.pdf', '.epub', '.txt', '.md', '.markdown', '.json', '.csv',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
  '.zip', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx',
];

function quotaBytes(env: { STORAGE_QUOTA_BYTES?: string }): number {
  const n = Number(env.STORAGE_QUOTA_BYTES);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_QUOTA;
}

function assertAllowed(name: string, contentType: string): void {
  const lower = name.toLowerCase();
  const okExt = ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
  const okType = ALLOWED_PREFIXES.some((prefix) => contentType.startsWith(prefix));
  if (!okExt && !okType) {
    throw badRequest(
      `不支持的文件类型：${name}（${contentType || '未知类型'}）。` +
        `允许的类型：${ALLOWED_EXTENSIONS.join(' ')}`,
    );
  }
}

/** 用 RFC 5987 编码文件名，中文名也不会乱码 */
function contentDisposition(name: string, inline: boolean): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(name);
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** 解析 Range 请求头，只支持单区间 bytes=start-end */
function parseRange(header: string | null, size: number): { offset: number; length: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;

  let start: number;
  let end: number;
  if (rawStart === '') {
    // bytes=-500 → 最后 500 字节
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Number(rawEnd);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null;
  end = Math.min(end, size - 1);
  return { offset: start, length: end - start + 1 };
}

export function registerDocuments(r: Router) {
  /** 列表 + 容量使用情况 */
  r.get('/api/documents', async ({ env }) => {
    const [documents, used] = await Promise.all([
      listDocuments(env.DB),
      storageUsed(env.DB),
    ]);
    const quota = quotaBytes(env);
    return ok({
      documents,
      storage: {
        usedBytes: used,
        quotaBytes: quota,
        remainingBytes: Math.max(0, quota - used),
        percent: quota > 0 ? Math.min(100, Math.round((used / quota) * 1000) / 10) : 0,
      },
    });
  });

  /**
   * 上传。使用 multipart/form-data，字段名 file。
   * 注意：Cloudflare Workers 对请求体大小有上限，几百 MB 的文件
   * 建议改用 R2 预签名 URL 直传（见 DEPLOY.md「大文件上传」一节）。
   */
  r.post('/api/documents', async ({ request, env }) => {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw badRequest('请求必须是 multipart/form-data 格式');
    }

    const file = form.get('file');
    if (!(file instanceof File)) throw badRequest('缺少文件字段 file');
    if (file.size === 0) throw badRequest('文件是空的');

    const name = str(file.name || '未命名文件', 'name', { max: 300 });
    const contentType = file.type || 'application/octet-stream';
    assertAllowed(name, contentType);

    // ── 容量校验 ──
    const quota = quotaBytes(env);
    const used = await storageUsed(env.DB);
    if (used + file.size > quota) {
      const usedMb = (used / 1024 / 1024).toFixed(1);
      const quotaMb = (quota / 1024 / 1024).toFixed(0);
      const fileMb = (file.size / 1024 / 1024).toFixed(1);
      throw new HttpError(
        413,
        `容量不足：已用 ${usedMb} MB / 上限 ${quotaMb} MB，本次要传 ${fileMb} MB。` +
          `请先删除一些文件，或调大 STORAGE_QUOTA_BYTES。`,
        'quota_exceeded',
      );
    }

    // ── 先写 R2，再写数据库 ──
    // 这个顺序很重要：万一数据库写失败，最多留下一个孤儿对象，
    // 而不会出现「数据库里有记录但文件不见了」这种更糟的情况。
    const r2Key = newId('f_');
    const bytes = await file.arrayBuffer();
    await env.BUCKET.put(r2Key, bytes, { httpMetadata: { contentType } });

    try {
      const doc = await createDocument(env.DB, {
        name,
        sizeBytes: file.size,
        contentType,
        r2Key,
      });
      return json({ document: doc }, { status: 201 });
    } catch (err) {
      // 回滚，避免孤儿对象占容量
      await env.BUCKET.delete(r2Key).catch(() => {});
      throw err;
    }
  });

  /** 读取文件本体，支持 Range（PDF 阅读器渐进加载要用） */
  r.get('/api/documents/:id/file', async ({ request, env, params }) => {
    const row = await getDocumentRow(env.DB, params.id);
    if (!row) throw notFound('文档不存在');

    const range = parseRange(request.headers.get('Range'), row.size_bytes);
    const object = await env.BUCKET.get(
      row.r2_key,
      range ? { range: { offset: range.offset, length: range.length } } : undefined,
    );
    if (!object) throw notFound('文件在存储中不存在（可能已被手动删除）');

    const headers = new Headers();
    headers.set('content-type', row.content_type || 'application/octet-stream');
    headers.set('accept-ranges', 'bytes');
    headers.set('cache-control', 'private, max-age=600');
    headers.set('content-disposition', contentDisposition(row.name, true));
    headers.set('etag', `"${row.id}-${row.size_bytes}"`);

    if (range) {
      headers.set('content-range', `bytes ${range.offset}-${range.offset + range.length - 1}/${row.size_bytes}`);
      headers.set('content-length', String(range.length));
      return new Response(object.body, { status: 206, headers });
    }

    headers.set('content-length', String(row.size_bytes));
    return new Response(object.body, { status: 200, headers });
  });

  /** 更新：重命名 / 记录阅读进度 / 标记「刚打开过」 */
  r.patch('/api/documents/:id', async ({ request, env, params }) => {
    const body = await readJson(request);
    const patch: { name?: string; lastPage?: number; totalPages?: number | null; opened?: boolean } = {};

    if ('name' in body) patch.name = str(body.name, 'name', { max: 300, required: true }).trim();
    if ('lastPage' in body) patch.lastPage = int(body.lastPage, 'lastPage', { min: 1, max: 1_000_000, def: 1 });
    if ('totalPages' in body) {
      patch.totalPages = body.totalPages === null ? null : int(body.totalPages, 'totalPages', { min: 1, max: 1_000_000, def: 1 });
    }
    if ('opened' in body) patch.opened = Boolean(body.opened);

    const document = await updateDocument(env.DB, params.id, patch);
    return ok({ document });
  });

  /** 删除：先删数据库记录，再删 R2 对象 */
  r.delete('/api/documents/:id', async ({ env, params }) => {
    const r2Key = await deleteDocument(env.DB, params.id);
    await env.BUCKET.delete(r2Key).catch(() => {});
    return ok({ deleted: params.id });
  });
}
