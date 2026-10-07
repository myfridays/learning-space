/**
 * 前端 import 路径检查
 * ------------------------------------------------------------------
 * 为什么需要这个工具：
 *   `node --check` 只验证语法，**不会解析 import 路径**。
 *   所以 `import { api } from './api.js'`（少了一个 ../）这种错误，
 *   语法检查完全看不出来，本地单元测试也碰不到（因为不加载那些模块），
 *   但一到浏览器里就是整页白屏——而且报错信息还挺绕。
 *
 *   这个脚本把 public/ 下所有 .js 的 import 路径解析成真实文件路径，
 *   逐一检查是否存在。有问题的直接列出来。
 *
 * 用法：node tools/check-imports.mjs
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'public');

/** 递归收集所有 .js 文件 */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/**
 * 提取 import / export ... from '...' 和 动态 import('...')
 * 只关心相对路径（以 . / .. 开头的），裸模块名跳过。
 */
function extractSpecifiers(source) {
  const specs = [];

  // import ... from '...'   /   export ... from '...'
  const staticRe = /(?:^|\n)\s*(?:import|export)\b[^;\n]*?from\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = staticRe.exec(source)) !== null) {
    specs.push({ spec: m[1], index: m.index });
  }

  // import '...'  （纯副作用导入）
  const bareRe = /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;
  while ((m = bareRe.exec(source)) !== null) {
    specs.push({ spec: m[1], index: m.index });
  }

  // 动态 import('...')
  const dynRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = dynRe.exec(source)) !== null) {
    specs.push({ spec: m[1], index: m.index });
  }

  return specs;
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

const files = walk(publicDir).sort();
let totalImports = 0;
const problems = [];

console.log('');
console.log(`检查 ${files.length} 个前端 JS 文件的 import 路径`);
console.log('─'.repeat(74));

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const rel = relative(root, file).split(sep).join('/');
  const specs = extractSpecifiers(source);

  for (const { spec, index } of specs) {
    if (!spec.startsWith('.') && !spec.startsWith('/')) continue; // 裸模块 / 绝对 URL 跳过
    totalImports++;

    // 绝对路径按 public/ 当根；相对路径按当前文件所在目录
    const target = spec.startsWith('/')
      ? join(publicDir, spec)
      : resolve(dirname(file), spec);

    if (!existsSync(target) || !statSync(target).isFile()) {
      problems.push({
        file: rel,
        line: lineOf(source, index),
        spec,
        resolved: relative(root, target).split(sep).join('/'),
      });
    }
  }
}

console.log(`共解析 ${totalImports} 条相对路径 import`);
console.log('');

if (problems.length === 0) {
  console.log('✅ 所有 import 路径都能解析到真实文件');
  console.log('');
  process.exit(0);
}

console.log(`\x1b[31m✗ 发现 ${problems.length} 条无法解析的 import（这会导致浏览器整页白屏）：\x1b[0m`);
console.log('');
for (const p of problems) {
  console.log(`  \x1b[31m${p.file}:${p.line}\x1b[0m`);
  console.log(`      import 写的是   ${p.spec}`);
  console.log(`      解析成           ${p.resolved}`);
  console.log(`      → 这个文件不存在`);
  console.log('');
}
console.log('修复方法：按文件层级补足 ../ 的层数。');
console.log('  public/js/views/xxx.js  里引用 js/ 根目录的文件要写 ../api.js');
console.log('  public/js/xxx.js        里引用同目录文件写 ./util.js');
console.log('');

process.exit(1);
