/**
 * 通过真实 HTTP 验证完整读写链路。
 * 用法：先启动 node tools/dev.mjs，再运行 node tools/test-http.mjs
 * 环境变量：BASE_URL（默认 http://127.0.0.1:8787）、APP_PASSWORD（默认从 .dev.vars 读）
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8787';

function readPassword() {
  if (process.env.APP_PASSWORD) return process.env.APP_PASSWORD;
  const file = join(root, '.dev.vars');
  if (!existsSync(file)) return '';
  const match = /^APP_PASSWORD=(.*)$/m.exec(readFileSync(file, 'utf8'));
  return match ? match[1].trim() : '';
}

let cookie = '';
let passed = 0;
let failed = 0;

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? `\n      → ${detail}` : ''}`);
  }
}

async function call(method, path, body, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (cookie) headers.cookie = cookie;

  let payload;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(BASE + path, { method, headers, body: payload });
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  if (setCookies.length) cookie = setCookies[0].split(';')[0];

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* 保留 text */
  }
  return { status: res.status, json, text, headers: res.headers };
}

console.log(`\n\x1b[1m通过真实 HTTP 验证 ${BASE}\x1b[0m\n`);

/* ── 1. 健康检查 & 登录 ── */

const health = await call('GET', '/api/health');
check('服务器在运行', health.status === 200, `HTTP ${health.status}`);

const password = readPassword();
if (health.json?.authEnabled) {
  const bad = await call('POST', '/api/auth/login', { password: 'definitely-wrong' });
  check('错误密码被拒绝', bad.status === 401, `HTTP ${bad.status}`);

  const login = await call('POST', '/api/auth/login', { password });
  check('正确密码登录成功', login.status === 200, `HTTP ${login.status}`);
  check('拿到了会话 Cookie', cookie.startsWith('ls_session='));
} else {
  check('本地未启用登录（APP_PASSWORD 未设置）', true);
}

/* ── 2. 笔记完整链路 ── */

const created = await call('POST', '/api/notes', {
  title: '端到端验证笔记',
  content: '# 标题\n\n这是 **粗体**，还有 `代码`。\n\n- 列表项\n\n| A | B |\n|---|---|\n| 1 | 2 |',
  tags: ['验证', '测试'],
});
check('创建笔记返回 201', created.status === 201, `HTTP ${created.status} ${created.text?.slice(0, 120)}`);

const noteId = created.json?.note?.id;
check('返回了笔记 id', typeof noteId === 'string' && noteId.length > 0);
check('中文标题正确保存', created.json?.note?.title === '端到端验证笔记');
check('标签解析正确', JSON.stringify(created.json?.note?.tags) === '["验证","测试"]');

const fetched = await call('GET', `/api/notes/${encodeURIComponent(noteId)}`);
check('读回笔记成功', fetched.status === 200);
check('正文里的换行被保留', fetched.json?.note?.content?.includes('\n'));
check('正文里的 Markdown 原样保存', fetched.json?.note?.content?.includes('**粗体**'));

const patched = await call('PATCH', `/api/notes/${encodeURIComponent(noteId)}`, {
  content: '内容改过了',
});
check('自动保存（PATCH）成功', patched.status === 200 && patched.json?.note?.content === '内容改过了');
check('局部更新没有误改标题', patched.json?.note?.title === '端到端验证笔记');

const searched = await call('GET', '/api/notes?q=' + encodeURIComponent('内容改过'));
check('搜索能命中刚改的内容', searched.json?.notes?.some((n) => n.id === noteId) === true);

/* ── 3. 待办 ── */

const todo = await call('POST', '/api/todos', {
  title: '端到端验证待办',
  priority: 'high',
  dueDate: '2026-10-06',
});
check('创建待办返回 201', todo.status === 201, `HTTP ${todo.status}`);

const todoDone = await call('PATCH', `/api/todos/${todo.json.todo.id}`, { done: true });
check('勾选待办成功', todoDone.json?.todo?.done === true);
check('记录完成时间', typeof todoDone.json?.todo?.doneAt === 'string');

/* ── 4. 习惯打卡 ── */

const today = new Date().toISOString().slice(0, 10);
const habitsBefore = await call('GET', `/api/habits?today=${today}`);
const habitId = habitsBefore.json?.habits?.[0]?.id;
check('能读取习惯列表', Array.isArray(habitsBefore.json?.habits));

if (habitId) {
  const before = habitsBefore.json?.habits?.find((h) => h.id === habitId);
  const streakBefore = before?.streak ?? 0;

  const checked = await call('POST', `/api/habits/${habitId}/check`, { day: today });
  check('打卡成功', checked.status === 200 && checked.json?.checked === true, JSON.stringify(checked.json));

  const after = await call('GET', `/api/habits?today=${today}`);
  const habit = after.json?.habits?.find((h) => h.id === habitId);
  // 用「相对增长」判断，这样本地库里有历史数据也不会误报
  // （精确的连续天数算法在 test-api.mjs 里用干净数据库单独验证过）
  check(
    `打卡后连续天数 +1（${streakBefore} → ${habit?.streak}）`,
    habit?.streak === streakBefore + 1,
    `实际 ${habit?.streak}`,
  );
  check('今日已打卡标记正确', habit?.checkedToday === true);

  const unchecked = await call('POST', `/api/habits/${habitId}/check`, { day: today, checked: false });
  check('取消打卡成功', unchecked.json?.checked === false);
}

/* ── 5. 文档上传与读取 ── */

const pdfContent = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n';
const form = new FormData();
form.set('file', new File([pdfContent], '端到端测试文档.pdf', { type: 'application/pdf' }));
const uploaded = await call('POST', '/api/documents', form);
check('上传 PDF 返回 201', uploaded.status === 201, `HTTP ${uploaded.status} ${uploaded.text?.slice(0, 120)}`);

const docId = uploaded.json?.document?.id;
check('中文文件名保留', uploaded.json?.document?.name === '端到端测试文档.pdf');

const fileRes = await fetch(`${BASE}/api/documents/${docId}/file`, { headers: { cookie } });
const fileText = await fileRes.text();
check('文件可直接读取', fileRes.status === 200 && fileText.startsWith('%PDF'));
check('content-type 正确', fileRes.headers.get('content-type') === 'application/pdf');

const rangeRes = await fetch(`${BASE}/api/documents/${docId}/file`, {
  headers: { cookie, Range: 'bytes=0-7' },
});
check('Range 请求返回 206', rangeRes.status === 206, `HTTP ${rangeRes.status}`);
check('Range 内容正确', (await rangeRes.text()) === '%PDF-1.4');

const docs = await call('GET', '/api/documents');
check('容量统计包含刚上传的文件', docs.json?.storage?.usedBytes >= pdfContent.length);

/* ── 6. 数据导出 ── */

const exported = await call('GET', '/api/data/export');
check('导出接口可用', exported.status === 200);
check('导出包含笔记', (exported.json?.counts?.notes ?? 0) >= 1);
check('导出包含文档元数据', (exported.json?.counts?.documents ?? 0) >= 1);

/* ── 7. 错误处理 ── */

const missing = await call('GET', '/api/notes/does-not-exist-at-all');
check('读取不存在的笔记返回 404', missing.status === 404, `HTTP ${missing.status}`);

const badMethod = await call('DELETE', '/api/health');
check('方法不匹配返回 405', badMethod.status === 405, `HTTP ${badMethod.status}`);

/* ── 收尾：清理测试数据 ── */

if (noteId) await call('DELETE', `/api/notes/${encodeURIComponent(noteId)}`);
if (todo.json?.todo?.id) await call('DELETE', `/api/todos/${todo.json.todo.id}`);
if (docId) await call('DELETE', `/api/documents/${docId}`);
if (habitId) await call('POST', `/api/habits/${habitId}/check`, { day: today, checked: false });

console.log('');
console.log('═'.repeat(58));
if (failed === 0) {
  console.log(`\x1b[32m全部通过\x1b[0m  ${passed} 项断言`);
} else {
  console.log(`\x1b[31m${failed} 项失败\x1b[0m，${passed} 项通过`);
}
console.log('═'.repeat(58));
console.log('');

process.exit(failed === 0 ? 0 : 1);
