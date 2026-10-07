/**
 * D1 绑定模拟器
 * ------------------------------------------------------------------
 * 用 Node.js 内置的 node:sqlite（Node 22+ 可用）实现 Cloudflare D1 的
 * Workers Binding API 子集，这样本地开发不需要 wrangler，也不需要联网。
 *
 * 支持的 API：
 *   db.prepare(sql).bind(...).first() / .all() / .run() / .raw()
 *   db.batch([...])
 *   db.exec(sql)
 *
 * 注意：这里的实现目标是「行为和线上一致」，不是「性能一致」。
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** 把 JS 值转成 SQLite 能绑定的值 */
function toSqlite(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return value;
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  // 兜底：对象转成 JSON 字符串（和 D1 存 JSON 的习惯一致）
  return JSON.stringify(value);
}

/** BigInt / undefined 归一化，避免 JSON 序列化时炸掉 */
function fromSqlite(row) {
  if (row === null || row === undefined) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = typeof v === 'bigint' ? Number(v) : v;
  }
  return out;
}

class PreparedStatement {
  #db;
  #sql;
  #params;

  constructor(db, sql, params = []) {
    this.#db = db;
    this.#sql = sql;
    this.#params = params;
  }

  bind(...values) {
    return new PreparedStatement(this.#db, this.#sql, values);
  }

  #bound() {
    return this.#params.map(toSqlite);
  }

  async first(colName) {
    const row = this.#db.prepare(this.#sql).get(...this.#bound());
    if (row === undefined || row === null) return null;
    const clean = fromSqlite(row);
    if (colName !== undefined && colName !== null) {
      return clean[colName] ?? null;
    }
    return clean;
  }

  async all() {
    const results = this.#db
      .prepare(this.#sql)
      .all(...this.#bound())
      .map(fromSqlite);
    return { results, success: true, meta: { rows_read: results.length } };
  }

  async run() {
    const info = this.#db.prepare(this.#sql).run(...this.#bound());
    return {
      success: true,
      results: [],
      meta: {
        changes: Number(info.changes ?? 0),
        last_row_id: Number(info.lastInsertRowid ?? 0),
        rows_written: Number(info.changes ?? 0),
      },
    };
  }

  async raw(options = {}) {
    const rows = this.#db.prepare(this.#sql).all(...this.#bound());
    return rows.map((row) => Object.values(row));
  }
}

export class D1Shim {
  #db;

  constructor(filename) {
    if (filename !== ':memory:') {
      mkdirSync(dirname(filename), { recursive: true });
    }
    this.#db = new DatabaseSync(filename);
    // D1 默认开启外键约束，保持一致
    this.#db.exec('PRAGMA foreign_keys = ON');
    // 提升并发下的稳定性
    this.#db.exec('PRAGMA journal_mode = WAL');
  }

  prepare(sql) {
    return new PreparedStatement(this.#db, sql);
  }

  async batch(statements) {
    const out = [];
    this.#db.exec('BEGIN');
    try {
      for (const stmt of statements) {
        out.push(await stmt.run());
      }
      this.#db.exec('COMMIT');
    } catch (err) {
      this.#db.exec('ROLLBACK');
      throw err;
    }
    return out;
  }

  async exec(sql) {
    this.#db.exec(sql);
    return { count: 1, duration: 0 };
  }

  /** 本地专用：直接拿到原生句柄（生产环境没有这个方法） */
  get native() {
    return this.#db;
  }

  close() {
    this.#db.close();
  }
}

/**
 * 按文件名顺序执行 migrations/ 目录下的所有 .sql 文件。
 * 迁移 SQL 本身是幂等的（IF NOT EXISTS / INSERT OR IGNORE），
 * 所以重复执行是安全的。
 */
export function applyMigrations(db, migrationsDir) {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied = [];
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    db.native.exec(sql);
    applied.push(file);
  }
  return applied;
}

export function createD1(filename) {
  return new D1Shim(filename);
}
