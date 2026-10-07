/**
 * R2 绑定模拟器
 * ------------------------------------------------------------------
 * 用本地文件系统模拟 Cloudflare R2 的 Workers Binding API 子集。
 * 文件真实落在 .local/r2/ 目录下，所以重启进程数据还在，
 * 能真实验证「上传的 PDF 不会丢」。
 *
 * 支持的 API：
 *   bucket.put(key, value, options?)
 *   bucket.get(key)  → { body, size, httpMetadata, text(), arrayBuffer(), ... }
 *   bucket.head(key)
 *   bucket.delete(key)
 *   bucket.list({ prefix, limit, cursor })
 */

import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  statSync,
  rmSync,
  readdirSync,
} from 'node:fs';
import { join, resolve, sep, dirname } from 'node:path';

/** 把对象键映射到本地路径，并阻止路径穿越 */
function keyToPath(root, key) {
  const safe = String(key).replace(/\\/g, '/').replace(/^\/+/, '');
  if (safe.includes('..')) {
    throw new Error(`非法对象键（包含 ..）: ${key}`);
  }
  const full = resolve(root, safe);
  const rootResolved = resolve(root);
  if (full !== rootResolved && !full.startsWith(rootResolved + sep)) {
    throw new Error(`非法对象键（越界）: ${key}`);
  }
  return full;
}

function guessContentType(key) {
  const lower = String(key).toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.txt') || lower.endsWith('.md')) return 'text/plain; charset=utf-8';
  if (lower.endsWith('.json')) return 'application/json; charset=utf-8';
  if (lower.endsWith('.zip')) return 'application/zip';
  if (lower.endsWith('.epub')) return 'application/epub+zip';
  return 'application/octet-stream';
}

function makeObject(key, bytes, contentType, uploaded) {
  const meta = {
    key,
    size: bytes.byteLength,
    etag: 'local',
    uploaded: uploaded ?? new Date(),
    httpMetadata: { contentType: contentType || guessContentType(key) },
    customMetadata: {},
  };
  return {
    ...meta,
    body: new Blob([bytes]).stream(),
    async text() {
      return new TextDecoder().decode(bytes);
    },
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
    async json() {
      return JSON.parse(new TextDecoder().decode(bytes));
    },
    writeHttpMetadata(headers) {
      headers.set('content-type', meta.httpMetadata.contentType);
    },
  };
}

export class R2Shim {
  #root;

  constructor(root) {
    this.#root = resolve(root);
    mkdirSync(this.#root, { recursive: true });
  }

  async put(key, value, options = {}) {
    const path = keyToPath(this.#root, key);
    mkdirSync(dirname(path), { recursive: true });

    let bytes;
    if (typeof value === 'string') {
      bytes = new TextEncoder().encode(value);
    } else if (value instanceof Uint8Array) {
      bytes = value;
    } else if (value instanceof ArrayBuffer) {
      bytes = new Uint8Array(value);
    } else if (value && typeof value.arrayBuffer === 'function') {
      bytes = new Uint8Array(await value.arrayBuffer());
    } else if (value && typeof value.getReader === 'function') {
      // ReadableStream
      const chunks = [];
      const reader = value.getReader();
      for (;;) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        chunks.push(chunk);
      }
      const total = chunks.reduce((n, c) => n + c.byteLength, 0);
      bytes = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        bytes.set(c, offset);
        offset += c.byteLength;
      }
    } else {
      bytes = new TextEncoder().encode(String(value));
    }

    writeFileSync(path, bytes);
    return makeObject(key, bytes, options?.httpMetadata?.contentType);
  }

  async get(key, options) {
    const path = keyToPath(this.#root, key);
    if (!existsSync(path)) return null;

    let bytes = new Uint8Array(readFileSync(path));
    const stat = statSync(path);

    // 支持 Range：和线上 R2 的 { range: { offset, length } } / { range: { suffix } } 对齐
    const range = options?.range;
    if (range && typeof range === 'object') {
      const total = bytes.byteLength;
      let offset = 0;
      let length = total;

      if (typeof range.suffix === 'number') {
        offset = Math.max(0, total - range.suffix);
        length = total - offset;
      } else {
        if (typeof range.offset === 'number') offset = Math.max(0, range.offset);
        length = typeof range.length === 'number' ? range.length : total - offset;
      }
      bytes = bytes.slice(offset, offset + length);
    }

    return makeObject(key, bytes, null, stat.mtime);
  }

  async head(key) {
    const path = keyToPath(this.#root, key);
    if (!existsSync(path)) return null;
    const stat = statSync(path);
    return {
      key,
      size: stat.size,
      etag: 'local',
      uploaded: stat.mtime,
      httpMetadata: { contentType: guessContentType(key) },
      customMetadata: {},
    };
  }

  async delete(key) {
    const keys = Array.isArray(key) ? key : [key];
    for (const k of keys) {
      const path = keyToPath(this.#root, k);
      if (existsSync(path)) rmSync(path, { force: true });
    }
  }

  async list(options = {}) {
    const prefix = options.prefix ?? '';
    const limit = options.limit ?? 1000;
    const objects = [];

    const walk = (dir, rel) => {
      if (!existsSync(dir)) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        const key = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          walk(full, key);
        } else if (key.startsWith(prefix)) {
          const stat = statSync(full);
          objects.push({
            key,
            size: stat.size,
            etag: 'local',
            uploaded: stat.mtime,
            httpMetadata: { contentType: guessContentType(key) },
            customMetadata: {},
          });
        }
      }
    };

    walk(this.#root, '');
    objects.sort((a, b) => a.key.localeCompare(b.key));

    return {
      objects: objects.slice(0, limit),
      truncated: objects.length > limit,
      cursor: undefined,
    };
  }
}

export function createR2(root) {
  return new R2Shim(root);
}
