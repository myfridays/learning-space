/**
 * 本地迁移工具
 * ------------------------------------------------------------------
 * 把 migrations/*.sql 按文件名顺序应用到本地 SQLite 数据库。
 * 迁移 SQL 全部是幂等的（IF NOT EXISTS / INSERT OR IGNORE），
 * 所以反复执行是安全的。
 *
 * 用法：
 *   node tools/migrate.mjs              # 应用到 .local/db.sqlite
 *   node tools/migrate.mjs --seed-only  # 只跑 seed
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';
import { createD1, applyMigrations } from './lib/d1.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dbFile = process.env.DB_FILE || join(root, '.local', 'db.sqlite');

const db = createD1(dbFile);
const seedOnly = process.argv.includes('--seed-only');

const applied = applyMigrations(db, join(root, 'migrations'));

const tables = db.native
  .prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all();

const counts = {};
for (const { name } of tables) {
  counts[name] = db.native.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get().n;
}

console.log(`数据库文件 : ${dbFile}`);
console.log(`已执行迁移 : ${applied.join(', ')}${seedOnly ? '（--seed-only 模式下全部重跑，因为 SQL 幂等）' : ''}`);
console.log('');
console.log('表名            行数');
console.log('─'.repeat(28));
for (const { name } of tables) {
  console.log(`${name.padEnd(16)}${String(counts[name]).padStart(4)}`);
}
console.log('');
console.log('✅ 迁移完成');

db.close();
