import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { renderMarkdown, markdownToPlain } from '../../public/js/markdown.js';
export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
export function parsePost(source, file) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(source);
  if (!match) throw new Error(`${file}: 缺少文章头信息`);
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const pair = /^(\w+):\s*(.*?)\s*$/.exec(line);
    if (!pair || !['title','date','slug','tags','description','draft'].includes(pair[1])) throw new Error(`${file}: 不支持的头信息 ${line}`);
    if (pair[1] in meta) throw new Error(`${file}: 重复字段 ${pair[1]}`);
    meta[pair[1]] = pair[2].replace(/^(["'])(.*)\1$/, '$2');
  }
  if (!meta.title?.trim()) throw new Error(`${file}: title 不能为空`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date || '') || !Number.isFinite(Date.parse(meta.date)) || new Date(meta.date).toISOString().slice(0,10) !== meta.date) throw new Error(`${file}: date 必须是有效 YYYY-MM-DD 日期`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(meta.slug || '')) throw new Error(`${file}: slug 只能包含小写英文、数字和中划线`);
  if (!['true','false'].includes(meta.draft)) throw new Error(`${file}: 必须明确填写 draft: true 或 false`);
  const tags = (meta.tags || '').replace(/^\[|\]$/g,'').split(/[,，]/).map(t => t.trim().replace(/^['"]|['"]$/g,'')).filter(Boolean);
  if (tags.some(t => !/^[\p{L}\p{N}_ -]{1,40}$/u.test(t))) throw new Error(`${file}: 标签仅支持文字、数字、空格、中划线和下划线，最多 40 字`);
  const body = match[2].trim();
  const toc = [];
  let html = renderMarkdown(body).replace(/<h([2-4])>(.*?)<\/h\1>/g, (_, level, title) => {
    const id = `section-${toc.length + 1}`; toc.push({ id, title, level });
    return `<h${level} id="${id}">${title}</h${level}>`;
  });
  return { ...meta, tags: [...new Set(tags)], draft: meta.draft === 'true', body, html, toc,
    description: meta.description || markdownToPlain(body, 150), minutes: Math.max(1, Math.ceil(body.length / 500)), path: `/posts/${meta.slug}/` };
}
export async function readPosts(dir) {
  const posts = [], slugs = new Set();
  for (const file of (await readdir(dir)).filter(f => f.endsWith('.md')).sort()) {
    const post = parsePost(await readFile(join(dir,file),'utf8'),file);
    if (slugs.has(post.slug)) throw new Error(`重复文章地址: ${post.slug}`);
    slugs.add(post.slug);
    if (!post.draft) posts.push(post);
  }
  return posts.sort((a,b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}
