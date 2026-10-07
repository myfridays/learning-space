/**
 * 读取 .dev.vars（dotenv 风格的 KEY=VALUE），并组装出 Worker 的 env 对象。
 * 和 wrangler 的 .dev.vars 格式保持一致，所以同一份文件两边都能用。
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export function loadDevVars(projectRoot) {
  const file = join(projectRoot, '.dev.vars');
  if (!existsSync(file)) return {};

  const out = {};
  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    } else {
      // 去掉行尾注释（仅当 # 前面有空格时）
      const hash = value.indexOf(' #');
      if (hash !== -1) value = value.slice(0, hash).trim();
    }
    out[key] = value;
  }
  return out;
}

/** 从 wrangler.jsonc 里提取 vars（去掉注释和尾逗号后按 JSON 解析） */
export function loadWranglerVars(projectRoot) {
  const file = join(projectRoot, 'wrangler.jsonc');
  if (!existsSync(file)) return {};

  let text = readFileSync(file, 'utf8');
  // 去掉 // 行注释（简单处理：不处理字符串内的 //，对本项目足够）
  text = text.replace(/^\s*\/\/.*$/gm, '');
  // 去掉尾随逗号
  text = text.replace(/,(\s*[}\]])/g, '$1');

  try {
    const parsed = JSON.parse(text);
    return parsed.vars ?? {};
  } catch (err) {
    console.warn('[env] 解析 wrangler.jsonc 失败，忽略 vars:', err.message);
    return {};
  }
}
