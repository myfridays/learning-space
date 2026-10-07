/**
 * 端到端 API 测试（零依赖）
 * ------------------------------------------------------------------
 * 直接调用 Worker 的 fetch 处理函数，不经过网络，所以跑得很快。
 * 但数据库和文件存储用的是真实实现（SQLite 文件 + 真实目录），
 * 因此能真实验证「数据有没有存住」。
 *
 * 用法：node tools/test-api.mjs  （或 npm run test）
 */

import { rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createD1, applyMigrations } from './lib/d1.mjs';
import { createR2 } from './lib/r2.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const testDir = join(root, '.local', 'test');

/* ── 初始化干净环境 ───────────────────────────────────── */

rmSync(testDir, { recursive: true, force: true });
mkdirSync(testDir, { recursive: true });

const dbFile = join(testDir, 'db.sqlite');
let db = createD1(dbFile);
applyMigrations(db, join(root, 'migrations'));

let bucket = createR2(join(testDir, 'r2'));

const assets = {
  async fetch() {
    return new Response('<html>index</html>', {
      headers: { 'content-type': 'text/html' },
    });
  },
};

const worker = (await import(pathToFileURL(join(root, 'worker', 'index.ts')).href)).default;

const baseEnv = {
  DB: db,
  BUCKET: bucket,
  ASSETS: assets,
  STORAGE_QUOTA_BYTES: String(8 * 1024 * 1024),
  AUTH_SECRET: 'test-secret',
};

/* ── 测试框架 ─────────────────────────────────────────── */

let passed = 0;
let failed = 0;
const failures = [];

function section(title) {
  console.log('');
  console.log(`\x1b[1m${title}\x1b[0m`);
}

function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed++;
    failures.push(name + (detail ? ` — ${detail}` : ''));
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? `\n      → ${detail}` : ''}`);
  }
}

/* ── 请求辅助 ─────────────────────────────────────────── */

let sessionCookie = '';

async function api(method, path, body, opts = {}) {
  const headers = new Headers();
  const useCookie = opts.cookie !== undefined ? opts.cookie : sessionCookie;
  if (useCookie) headers.set('cookie', useCookie);

  let payload;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers.set('content-type', 'application/json');
    payload = JSON.stringify(body);
  }

  const request = new Request('http://local' + path, { method, headers, body: payload });
  const response = await worker.fetch(request, opts.env ?? baseEnv, {});
  const text = await response.text();

  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* 非 JSON 响应，保留 text */
  }
  return { status: response.status, json, text, headers: response.headers };
}

/** 本地日期 YYYY-MM-DD */
function ymd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function shift(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

const today = ymd(new Date());

/* ══════════════════════════════════════════════════════ */
/*  1. 健康检查                                          */
/* ══════════════════════════════════════════════════════ */

section('1. 健康检查');

{
  const res = await api('GET', '/api/health');
  check('GET /api/health 返回 200', res.status === 200, `实际 ${res.status}`);
  check('响应包含 ok: true', res.json?.ok === true);
  check('数据库绑定存在', res.json?.database === true);
  check('存储绑定存在', res.json?.storage === true);
  check('响应的 cache-control 是 no-store', res.headers.get('cache-control') === 'no-store');
}

/* ══════════════════════════════════════════════════════ */
/*  2. 笔记 CRUD + 跨设备可见性                            */
/* ══════════════════════════════════════════════════════ */

section('2. 笔记：写入 → 读取 → 跨设备 → 搜索 → 删除');

let noteId = '';

{
  const res = await api('POST', '/api/notes', {
    title: 'SQLite FTS5 中文分词踩坑',
    content: '默认 tokenizer 对中文基本没用，试了 simple / trigram / jieba 三种方案。',
    tags: ['数据库', '踩坑'],
  });
  check('创建笔记返回 201', res.status === 201, `实际 ${res.status}`);
  check('返回了笔记 id', typeof res.json?.note?.id === 'string');
  check('标签被正确解析成数组', Array.isArray(res.json?.note?.tags) && res.json.note.tags.length === 2);
  check('自动生成了摘要 excerpt', typeof res.json?.note?.excerpt === 'string' && res.json.note.excerpt.length > 0);
  noteId = res.json?.note?.id;
}

{
  const res = await api('GET', `/api/notes/${noteId}`);
  check('按 id 读取笔记成功', res.status === 200 && res.json?.note?.id === noteId);
  check('正文完整保存', res.json?.note?.content?.includes('trigram'));
}

{
  const res = await api('PATCH', `/api/notes/${noteId}`, { content: '改过的内容：最终选了 jieba 预处理。' });
  check('PATCH 局部更新返回 200', res.status === 200);
  check('正文已更新', res.json?.note?.content?.includes('最终选了 jieba'));
  check('标题没有被误改（局部更新生效）', res.json?.note?.title === 'SQLite FTS5 中文分词踩坑');
}

// ★ 关键测试：模拟「换一台设备 / 重启服务」后数据是否还在
{
  const freshDb = createD1(dbFile);
  const freshBucket = createR2(join(testDir, 'r2'));
  const freshEnv = { ...baseEnv, DB: freshDb, BUCKET: freshBucket };

  const res = await api('GET', `/api/notes/${noteId}`, undefined, { env: freshEnv });
  check(
    '★ 换一个全新的数据库连接，数据依然存在（跨设备可见）',
    res.status === 200 && res.json?.note?.content?.includes('最终选了 jieba'),
    `status=${res.status}`,
  );
  freshDb.close();
}

{
  const res = await api('GET', '/api/notes?q=jieba');
  check('关键词搜索能命中正文', res.json?.notes?.some((n) => n.id === noteId) === true);

  const miss = await api('GET', '/api/notes?q=完全不存在的关键词zzz');
  check('搜不到时返回空数组', Array.isArray(miss.json?.notes) && miss.json.notes.length === 0);

  const byTag = await api('GET', '/api/notes?tag=' + encodeURIComponent('数据库'));
  check('按标签过滤能命中', byTag.json?.notes?.some((n) => n.id === noteId) === true);

  const wrongTag = await api('GET', '/api/notes?tag=' + encodeURIComponent('前端'));
  check('不匹配的标签不会误命中', !wrongTag.json?.notes?.some((n) => n.id === noteId));
}

{
  const res = await api('GET', '/api/notes/tags');
  check('标签统计接口可用', res.status === 200 && Array.isArray(res.json?.tags));
  check('标签统计包含「数据库」', res.json?.tags?.some((t) => t.tag === '数据库' && t.count >= 1));
}

/* ── 批量删除 ─────────────────────────────────────────── */

{
  const ids = [];
  for (let i = 0; i < 3; i++) {
    const res = await api('POST', '/api/notes', {
      title: `批量删除测试 ${i}`,
      content: '待删除',
      tags: [],
    });
    ids.push(res.json.note.id);
  }

  const before = await api('GET', '/api/notes');
  const countBefore = before.json.total;

  const del = await api('POST', '/api/notes/batch-delete', { ids });
  check('批量删除返回 200', del.status === 200, `实际 ${del.status}`);
  check('返回删除条数 = 3', del.json?.deleted === 3, `实际 ${del.json?.deleted}`);
  check('requested 字段也返回了', del.json?.requested === 3);

  const gone = await api('GET', `/api/notes/${ids[0]}`);
  check('批量删除后按 id 读不到（404）', gone.status === 404, `实际 ${gone.status}`);

  const after = await api('GET', '/api/notes');
  check('总数减少了 3', after.json.total === countBefore - 3, `${countBefore} → ${after.json.total}`);

  // 参数校验
  const emptyIds = await api('POST', '/api/notes/batch-delete', { ids: [] });
  check('空数组被拒绝（400）', emptyIds.status === 400, `实际 ${emptyIds.status}`);

  const notArray = await api('POST', '/api/notes/batch-delete', { ids: 'abc' });
  check('ids 不是数组被拒绝（400）', notArray.status === 400);

  const missing = await api('POST', '/api/notes/batch-delete', {});
  check('缺少 ids 被拒绝（400）', missing.status === 400);

  const tooMany = await api('POST', '/api/notes/batch-delete', {
    ids: Array.from({ length: 501 }, (_, i) => `fake_${i}`),
  });
  check('超过 500 条被拒绝（400）', tooMany.status === 400, `实际 ${tooMany.status}`);

  // 删除不存在的 id 不算错误，只是 deleted 少一些
  const bogus = await api('POST', '/api/notes/batch-delete', { ids: ['不存在_a', '不存在_b'] });
  check('删除不存在的 id 返回 200 而不是报错', bogus.status === 200, `实际 ${bogus.status}`);
  check('deleted 为 0', bogus.json?.deleted === 0, `实际 ${bogus.json?.deleted}`);

  // 重复 id 只算一次
  const dup = await api('POST', '/api/notes', { title: '重复 id 测试', content: 'x', tags: [] });
  const dupId = dup.json.note.id;
  const dupDel = await api('POST', '/api/notes/batch-delete', { ids: [dupId, dupId, dupId] });
  check('重复 id 去重后只删一次', dupDel.json?.deleted === 1, `实际 ${dupDel.json?.deleted}`);
}

/* ══════════════════════════════════════════════════════ */
/*  3. 待办                                              */
/* ══════════════════════════════════════════════════════ */

section('3. 待办');

let todoId = '';

{
  const res = await api('POST', '/api/todos', {
    title: '完成 CSAPP 第 3 章习题',
    detail: '今天截止',
    priority: 'high',
    dueDate: today,
  });
  check('创建待办返回 201', res.status === 201, `实际 ${res.status}`);
  check('优先级保存正确', res.json?.todo?.priority === 'high');
  check('截止日期保存正确', res.json?.todo?.dueDate === today);
  todoId = res.json?.todo?.id;
}

{
  const bad = await api('POST', '/api/todos', { title: 'x', priority: '紧急' });
  check('非法优先级被拒绝（400）', bad.status === 400, `实际 ${bad.status}`);

  const noTitle = await api('POST', '/api/todos', { title: '   ' });
  check('空标题被拒绝（400）', noTitle.status === 400);

  const badDate = await api('POST', '/api/todos', { title: 'x', dueDate: '2026-02-30' });
  check('不存在的日期被拒绝（400）', badDate.status === 400);
}

{
  const res = await api('PATCH', `/api/todos/${todoId}`, { done: true });
  check('勾选完成成功', res.status === 200 && res.json?.todo?.done === true);
  check('完成时间被自动记录', typeof res.json?.todo?.doneAt === 'string' && res.json.todo.doneAt.length > 0);

  const back = await api('PATCH', `/api/todos/${todoId}`, { done: false });
  check('取消完成后 doneAt 被清空', back.json?.todo?.doneAt === null);
}

{
  const res = await api('GET', '/api/todos');
  check('待办列表接口可用', res.status === 200 && Array.isArray(res.json?.todos));
  check('openCount 字段存在', typeof res.json?.openCount === 'number');
}

/* ══════════════════════════════════════════════════════ */
/*  4. 习惯打卡 + 连续天数                                */
/* ══════════════════════════════════════════════════════ */

section('4. 习惯打卡与连续天数');

let habitId = '';

{
  const res = await api('POST', '/api/habits', { name: '阅读 30 分钟', icon: '📖' });
  check('创建习惯返回 201', res.status === 201, `实际 ${res.status}`);
  habitId = res.json?.habit?.id;
}

{
  const res = await api('GET', `/api/habits?today=${today}`);
  const habit = res.json?.habits?.find((h) => h.id === habitId);
  check('新习惯连续天数为 0', habit?.streak === 0);
  check('新习惯今日未打卡', habit?.checkedToday === false);
}

{
  const res = await api('POST', `/api/habits/${habitId}/check`, { day: today });
  check('打卡成功', res.status === 200 && res.json?.checked === true);

  const again = await api('POST', `/api/habits/${habitId}/check`, { day: today });
  check('重复打卡是切换语义（第二次变成取消）', again.json?.checked === false);

  await api('POST', `/api/habits/${habitId}/check`, { day: today });
  const list = await api('GET', `/api/habits?today=${today}`);
  const habit = list.json?.habits?.find((h) => h.id === habitId);
  check('打卡后 checkedToday = true', habit?.checkedToday === true);
  check('打卡后连续天数为 1', habit?.streak === 1, `实际 ${habit?.streak}`);
}

{
  // 补打昨天 → 连续 2 天
  await api('POST', `/api/habits/${habitId}/check`, { day: ymd(shift(new Date(), -1)) });
  let res = await api('GET', `/api/habits?today=${today}`);
  let habit = res.json?.habits?.find((h) => h.id === habitId);
  check('连续两天打卡后 streak = 2', habit?.streak === 2, `实际 ${habit?.streak}`);

  // 取消今天 → 应该从昨天开始算，streak 仍然是 1
  await api('POST', `/api/habits/${habitId}/check`, { day: today, checked: false });
  res = await api('GET', `/api/habits?today=${today}`);
  habit = res.json?.habits?.find((h) => h.id === habitId);
  check('取消今天后从昨天算起 streak = 1', habit?.streak === 1, `实际 ${habit?.streak}`);
  check('取消后 checkedToday = false', habit?.checkedToday === false);

  // 显式 checked:true 再次打卡
  await api('POST', `/api/habits/${habitId}/check`, { day: today, checked: true });
  res = await api('GET', `/api/habits?today=${today}`);
  habit = res.json?.habits?.find((h) => h.id === habitId);
  check('显式 checked:true 可以重新打卡', habit?.checkedToday === true && habit?.streak === 2);
}

{
  const bad = await api('POST', `/api/habits/${habitId}/check`, { day: '2026/01/01' });
  check('非法日期格式被拒绝（400）', bad.status === 400);

  const missing = await api('POST', '/api/habits/not-exist/check', { day: today });
  check('给不存在的习惯打卡返回 404', missing.status === 404, `实际 ${missing.status}`);
}

/* ══════════════════════════════════════════════════════ */
/*  5. 文档上传 / 容量限制 / Range 读取                    */
/* ══════════════════════════════════════════════════════ */

section('5. 文档：上传、容量上限、断点读取');

// 造一个最小的合法 PDF 头部
const pdfBytes = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
let docId = '';

{
  const form = new FormData();
  form.set('file', new File([pdfBytes], '测试文档.pdf', { type: 'application/pdf' }));
  const res = await api('POST', '/api/documents', form);
  check('上传 PDF 返回 201', res.status === 201, `实际 ${res.status} ${res.text.slice(0, 120)}`);
  check('文件名保留（含中文）', res.json?.document?.name === '测试文档.pdf');
  check('文件大小记录正确', res.json?.document?.sizeBytes === pdfBytes.byteLength);
  docId = res.json?.document?.id;
}

{
  const res = await api('GET', '/api/documents');
  const doc = res.json?.documents?.find((d) => d.id === docId);
  check('文档出现在列表中', Boolean(doc));
  check('容量统计等于文件大小', res.json?.storage?.usedBytes === pdfBytes.byteLength);
  check('容量百分比已计算', typeof res.json?.storage?.percent === 'number');
}

{
  const res = await api('GET', `/api/documents/${docId}/file`);
  check('读取文件本体返回 200', res.status === 200, `实际 ${res.status}`);
  check('content-type 是 application/pdf', res.headers.get('content-type') === 'application/pdf');
  check('支持 Range（声明 accept-ranges）', res.headers.get('accept-ranges') === 'bytes');
  check('文件内容完整', res.text.startsWith('%PDF-1.4'));

  const rangeRes = await worker.fetch(
    new Request(`http://local/api/documents/${docId}/file`, {
      headers: { Range: 'bytes=0-7' },
    }),
    baseEnv,
    {},
  );
  const rangeBody = await rangeRes.text();
  check('Range 请求返回 206', rangeRes.status === 206, `实际 ${rangeRes.status}`);
  check('Content-Range 头正确', rangeRes.headers.get('content-range') === `bytes 0-7/${pdfBytes.byteLength}`);
  check('Range 返回的是局部内容', rangeBody === '%PDF-1.4');
}

{
  const exeForm = new FormData();
  exeForm.set('file', new File([new Uint8Array([1, 2, 3])], 'virus.exe', { type: 'application/x-msdownload' }));
  const res = await api('POST', '/api/documents', exeForm);
  check('非白名单类型被拒绝（400）', res.status === 400, `实际 ${res.status}`);
}

{
  // 把容量上限设成 10 字节，上传一个更大的文件，应该被拦下
  const smallEnv = { ...baseEnv, STORAGE_QUOTA_BYTES: '10' };
  const form = new FormData();
  form.set('file', new File([new Uint8Array(1000)], 'big.pdf', { type: 'application/pdf' }));
  const res = await api('POST', '/api/documents', form, { env: smallEnv });
  check('超出容量上限返回 413', res.status === 413, `实际 ${res.status}`);
  check('错误码是 quota_exceeded', res.json?.code === 'quota_exceeded');
}

{
  const res = await api('PATCH', `/api/documents/${docId}`, { lastPage: 42, totalPages: 300, opened: true });
  check('阅读进度可以保存', res.json?.document?.lastPage === 42);
  check('总页数可以保存', res.json?.document?.totalPages === 300);
  check('最近打开时间被记录', typeof res.json?.document?.openedAt === 'string');
}

{
  const res = await api('DELETE', `/api/documents/${docId}`);
  check('删除文档成功', res.status === 200);
  const stillThere = await api('GET', `/api/documents/${docId}/file`);
  check('删除后文件读不到了', stillThere.status === 404);
  const list = await api('GET', '/api/documents');
  check('删除后容量统计归零', list.json?.storage?.usedBytes === 0);
}

/* ══════════════════════════════════════════════════════ */
/*  6. 数据导出                                          */
/* ══════════════════════════════════════════════════════ */

section('6. 数据导出（你的数据可以随时带走）');

{
  const res = await api('GET', '/api/data/export');
  check('导出接口返回 200', res.status === 200);
  check('导出内容包含笔记', res.json?.counts?.notes >= 1);
  check('导出内容包含习惯', res.json?.counts?.habits >= 1);
  check('导出内容包含打卡记录', res.json?.counts?.habitLogs >= 1);
  check('导出说明里提示了文件本体不含在内', typeof res.json?.notice === 'string' && res.json.notice.includes('文件本体'));
  check(
    '带 attachment 头，浏览器会直接下载',
    (res.headers.get('content-disposition') ?? '').startsWith('attachment'),
  );
}

/* ══════════════════════════════════════════════════════ */
/*  7. 认证                                              */
/* ══════════════════════════════════════════════════════ */

section('7. 认证（设置 APP_PASSWORD 之后）');

{
  const securedEnv = { ...baseEnv, APP_PASSWORD: 'my-secret-password' };
  const savedCookie = sessionCookie;
  sessionCookie = '';

  const noAuth = await api('GET', '/api/notes', undefined, { env: securedEnv });
  check('未登录访问受保护接口返回 401', noAuth.status === 401, `实际 ${noAuth.status}`);
  check('401 响应体是 JSON', noAuth.json?.code === 'unauthorized');

  const wrong = await api('POST', '/api/auth/login', { password: '猜的密码' }, { env: securedEnv });
  check('错误密码返回 401', wrong.status === 401, `实际 ${wrong.status}`);
  check('错误码是 bad_credentials', wrong.json?.code === 'bad_credentials');

  const right = await api('POST', '/api/auth/login', { password: 'my-secret-password' }, { env: securedEnv });
  check('正确密码登录返回 200', right.status === 200, `实际 ${right.status}`);

  const setCookie = right.headers.getSetCookie?.() ?? [];
  check('登录返回了 Set-Cookie', setCookie.length > 0);
  check('Cookie 带 HttpOnly', (setCookie[0] ?? '').includes('HttpOnly'));
  check('Cookie 带 SameSite=Lax', (setCookie[0] ?? '').includes('SameSite=Lax'));
  check('本地 http 下不应带 Secure（否则浏览器不保存）', !(setCookie[0] ?? '').includes('Secure'));

  const cookieValue = (setCookie[0] ?? '').split(';')[0];
  const authed = await api('GET', '/api/notes', undefined, { env: securedEnv, cookie: cookieValue });
  check('带上会话 Cookie 后可以正常访问', authed.status === 200, `实际 ${authed.status}`);

  const tampered = await api('GET', '/api/notes', undefined, {
    env: securedEnv,
    cookie: cookieValue.slice(0, -3) + 'aaa',
  });
  check('被篡改的 Cookie 会被拒绝（签名校验生效）', tampered.status === 401, `实际 ${tampered.status}`);

  const me = await api('GET', '/api/auth/me', undefined, { env: securedEnv, cookie: cookieValue });
  check('/api/auth/me 返回已登录状态', me.json?.authenticated === true);

  const logout = await api('POST', '/api/auth/logout', {}, { env: securedEnv, cookie: cookieValue });
  check('登出返回 200', logout.status === 200);
  check('登出会清空 Cookie', (logout.headers.getSetCookie?.()?.[0] ?? '').includes('Max-Age=0'));

  sessionCookie = savedCookie;
}

/* ══════════════════════════════════════════════════════ */
/*  8. 重启后数据仍在（最关键的一条）                      */
/* ══════════════════════════════════════════════════════ */

section('8. ★ 模拟服务重启：数据是否还在');

{
  db.close();
  db = createD1(dbFile);
  bucket = createR2(join(testDir, 'r2'));
  // 关键：baseEnv 里还引用着已经关闭的旧连接，必须一起换掉
  baseEnv.DB = db;
  baseEnv.BUCKET = bucket;
  const restartedEnv = { ...baseEnv, DB: db, BUCKET: bucket };

  const boot = await api('GET', `/api/bootstrap?today=${today}`, undefined, { env: restartedEnv });
  check('★ 重启后首页聚合接口正常', boot.status === 200, `实际 ${boot.status}`);
  check('★ 重启后笔记还在', boot.json?.notes?.total >= 1);
  check('★ 重启后待办还在', boot.json?.todos?.total >= 1);
  check('★ 重启后习惯还在', (boot.json?.habits?.items?.length ?? 0) >= 1);
  check('★ 重启后打卡记录还在（含连续天数）', boot.json?.habits?.bestStreak >= 1);

  const note = await api('GET', `/api/notes/${noteId}`, undefined, { env: restartedEnv });
  check('★ 重启后笔记正文一字不差', note.json?.note?.content === '改过的内容：最终选了 jieba 预处理。');
}

/* ══════════════════════════════════════════════════════ */
/*  9. 错误处理                                          */
/* ══════════════════════════════════════════════════════ */

section('9. 错误处理');

{
  const res = await api('GET', '/api/does-not-exist');
  check('未知接口返回 404', res.status === 404, `实际 ${res.status}`);
  check('404 是 JSON 而不是 HTML', res.json?.error !== undefined);

  const wrongMethod = await api('DELETE', '/api/health');
  check('方法不匹配返回 405', wrongMethod.status === 405, `实际 ${wrongMethod.status}`);

  const badJson = await worker.fetch(
    new Request('http://local/api/notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ 这不是合法 JSON',
    }),
    baseEnv,
    {},
  );
  check('非法 JSON 返回 400 而不是 500', badJson.status === 400, `实际 ${badJson.status}`);

  const emptyBody = await worker.fetch(
    new Request('http://local/api/notes', { method: 'POST' }),
    baseEnv,
    {},
  );
  check('空请求体也能优雅处理（创建一篇空笔记）', emptyBody.status === 201, `实际 ${emptyBody.status}`);
}

/* ── 收尾 ─────────────────────────────────────────────── */

db.close();

console.log('');
console.log('═'.repeat(58));
if (failed === 0) {
  console.log(`\x1b[32m全部通过\x1b[0m  ${passed} 项断言`);
} else {
  console.log(`\x1b[31m${failed} 项失败\x1b[0m，${passed} 项通过`);
  console.log('');
  for (const f of failures) console.log(`  ✗ ${f}`);
}
console.log('═'.repeat(58));
console.log('');

process.exit(failed === 0 ? 0 : 1);
