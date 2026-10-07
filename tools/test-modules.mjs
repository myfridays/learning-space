/**
 * 前端模块加载测试
 * ------------------------------------------------------------------
 * 为什么需要这个：
 *   之前出过一次事故——public/js/views/login.js 里把 `../api.js` 写成了
 *   `./api.js`，浏览器里去请求 /js/views/api.js 直接 404，整个模块图崩溃，
 *   页面一片空白。
 *
 *   而这个错误：
 *     · `node --check` 查不出来（它只看语法，不解析 import 路径）
 *     · 单元测试查不出来（只测了 markdown.js / util.js，没加载 login.js）
 *     · 后端测试更查不出来
 *
 *   所以专门加这个测试：在 Node 里用最小 DOM 桩把整个模块图真正加载一遍。
 *   只要有任何一条 import 路径写错、或者模块顶层代码抛异常，这里立刻失败。
 *
 * 用法：node tools/test-modules.mjs
 */

import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'public');

/* ══════════════════════════════════════════════════════════
   最小 DOM 桩：够让 app.js 的启动流程跑完就行
   ══════════════════════════════════════════════════════════ */

function makeElement(tag = 'div') {
  // 同一个选择器返回同一个元素，这样测试里可以回读子元素的内容
  const queried = new Map();

  const el = {
    tagName: String(tag).toUpperCase(),
    children: [],
    style: {},
    dataset: {},
    hidden: false,
    innerHTML: '',
    textContent: '',
    value: '',
    files: [],
    classList: {
      _set: new Set(),
      add(...c) { c.forEach((x) => this._set.add(x)); },
      remove(...c) { c.forEach((x) => this._set.delete(x)); },
      toggle(c, force) {
        const on = force === undefined ? !this._set.has(c) : force;
        if (on) this._set.add(c); else this._set.delete(c);
        return on;
      },
      contains(c) { return this._set.has(c); },
    },
    setAttribute() {},
    getAttribute() { return null; },
    removeAttribute() {},
    appendChild(child) { this.children.push(child); return child; },
    insertBefore(child) { this.children.push(child); return child; },
    removeChild() {},
    remove() {},
    replaceWith() {},
    addEventListener() {},
    removeEventListener() {},
    querySelector(selector) {
      if (!queried.has(selector)) queried.set(selector, makeElement());
      return queried.get(selector);
    },
    querySelectorAll() { return []; },
    closest() { return null; },
    focus() {},
    blur() {},
    select() {},
    click() {},
    setSelectionRange() {},
    getBoundingClientRect() { return { width: 0, height: 0, top: 0, left: 0 }; },
    cloneNode() { return makeElement(tag); },
  };
  return el;
}

/** Node 里有些全局属性（比如 navigator）是只读的，得用 defineProperty 覆盖 */
function defineGlobal(name, value) {
  try {
    Object.defineProperty(globalThis, name, {
      value,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  } catch {
    try {
      globalThis[name] = value;
    } catch {
      console.warn(`[警告] 无法覆盖全局属性 ${name}`);
    }
  }
}

const storage = new Map();
const domListeners = new Map();
const capturedErrors = [];

defineGlobal('document', {
  documentElement: makeElement('html'),
  body: makeElement('body'),
  head: makeElement('head'),
  getElementById() { return makeElement(); },
  querySelector() { return makeElement(); },
  querySelectorAll() { return []; },
  createElement(tag) { return makeElement(tag); },
  createTextNode() { return makeElement('#text'); },
  addEventListener(type, fn) {
    if (!domListeners.has(type)) domListeners.set(type, []);
    domListeners.get(type).push(fn);
  },
  removeEventListener() {},
});

const mediaQuery = {
  matches: false,
  media: '',
  addEventListener() {},
  removeEventListener() {},
};

const fakeWindow = {
  matchMedia: () => mediaQuery,
  addEventListener(type, fn) {
    if (!domListeners.has(type)) domListeners.set(type, []);
    domListeners.get(type).push(fn);
  },
  removeEventListener() {},
  location: { hash: '', href: 'http://localhost/', hostname: 'localhost', reload() {} },
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
  },
  navigator: { userAgent: 'node-test' },
  setTimeout,
  clearTimeout,
};

defineGlobal('window', fakeWindow);
defineGlobal('location', fakeWindow.location);
defineGlobal('localStorage', fakeWindow.localStorage);
defineGlobal('navigator', fakeWindow.navigator);
defineGlobal('matchMedia', fakeWindow.matchMedia);

// 桩掉 fetch：让 api.me() 返回「需要登录」，这样启动流程会走到登录页就结束，
// 既能走完 import 解析，又不需要完整的后端。
defineGlobal('fetch', async (input) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url.includes('/api/auth/me')) {
    return new Response(JSON.stringify({ authEnabled: true, authenticated: false }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ error: '测试桩：未实现 ' + url }), {
    status: 501,
    headers: { 'content-type': 'application/json' },
  });
});

process.on('unhandledRejection', (err) => capturedErrors.push(err));

/* ══════════════════════════════════════════════════════════
   逐个加载模块
   ══════════════════════════════════════════════════════════ */

const MODULES = [
  'js/util.js',
  'js/markdown.js',
  'js/api.js',
  'js/components.js',
  'js/views/login.js',
  'js/views/dashboard.js',
  'js/views/notes.js',
  'js/views/todos.js',
  'js/views/habits.js',
  'js/views/files.js',
  'js/views/settings.js',
  'js/app.js', // 放最后：它会拉起整张图并执行 boot()
];

let passed = 0;
let failed = 0;

console.log('');
console.log('在 Node 里真正加载前端模块图（含 import 解析 + 顶层代码执行）');
console.log('─'.repeat(74));

for (const rel of MODULES) {
  const url = pathToFileURL(join(publicDir, rel)).href;
  try {
    await import(url);
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${rel}`);
  } catch (err) {
    failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${rel}`);
    console.log(`      ${err.constructor.name}: ${err.message}`);
    if (err.stack) {
      const line = err.stack.split('\n').find((l) => l.includes('public'));
      if (line) console.log(`      ${line.trim()}`);
    }
  }
}

/* 给 boot() 的异步流程一点时间跑完 */
await new Promise((r) => setTimeout(r, 300));

/* ══════════════════════════════════════════════════════════
   第二阶段：用符合真实形状的数据，把每个页面渲染一遍
   —— 模块能加载 ≠ 页面能渲染。这一层专门抓模板里的运行时错误。
   ══════════════════════════════════════════════════════════ */

console.log('');
console.log('用模拟数据渲染每个页面（抓模板里的运行时错误）');
console.log('─'.repeat(74));

const NOTE = {
  id: 'note_1',
  title: '测试笔记',
  content: '# 标题\n\n正文 **粗体** `代码`\n\n- 列表\n\n| A | B |\n|---|---|\n| 1 | 2 |',
  excerpt: '标题 正文 粗体 代码 列表',
  tags: ['测试', '前端'],
  pinned: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-06T00:00:00.000Z',
};

const TODO = {
  id: 'todo_1',
  title: '测试待办',
  detail: '细节',
  priority: 'high',
  done: false,
  dueDate: '2026-10-06',
  sortOrder: 1,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-06T00:00:00.000Z',
  doneAt: null,
};

const HABIT = {
  id: 'habit_1',
  name: '阅读',
  icon: '📖',
  color: '#186b5f',
  active: true,
  sortOrder: 1,
  createdAt: '2026-10-01T00:00:00.000Z',
  streak: 3,
  checkedToday: true,
  totalDays: 10,
};

const DOC = {
  id: 'doc_1',
  name: '测试文档.pdf',
  sizeBytes: 123456,
  contentType: 'application/pdf',
  createdAt: '2026-10-01T00:00:00.000Z',
  lastPage: 5,
  totalPages: 100,
  openedAt: '2026-10-06T00:00:00.000Z',
};

const BOOTSTRAP = {
  today: '2026-10-06',
  notes: { recent: [NOTE], total: 7, tags: [{ tag: '测试', count: 3 }] },
  todos: { items: [TODO], open: 1, done: 0, total: 1 },
  habits: { items: [HABIT], logs: [{ habitId: 'habit_1', day: '2026-10-06', count: 1, note: '' }], from: '2026-06-17', days: 112, bestStreak: 3 },
  documents: { items: [DOC], usedBytes: 123456, quotaBytes: 8589934592, remainingBytes: 8589811136, percent: 0 },
};

function ok(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

// 换一个能把所有接口都答上来的 fetch 桩
defineGlobal('fetch', async (input) => {
  const url = typeof input === 'string' ? input : input.url;
  const path = url.startsWith('http') ? new URL(url).pathname + new URL(url).search : url;

  if (path.includes('/api/auth/me')) return ok({ authEnabled: true, authenticated: true });
  if (path.includes('/api/bootstrap')) return ok(BOOTSTRAP);
  if (path.includes('/api/data/stats')) {
    return ok({
      notes: { total: 7, tags: 1, tagList: [{ tag: '测试', count: 3 }] },
      todos: { total: 1, open: 1, done: 0 },
      habits: { total: 1, active: 1 },
      documents: { total: 1, usedBytes: 123456, quotaBytes: 8589934592, remainingBytes: 8589811136, percent: 0 },
    });
  }
  if (path.includes('/api/notes/tags')) return ok({ tags: [{ tag: '测试', count: 3 }] });
  // 单篇笔记必须排在列表前面判断，否则 /api/notes/xxx 会被列表规则吃掉
  const singleNote = /\/api\/notes\/([^/?]+)/.exec(path);
  if (singleNote) return ok({ note: { ...NOTE, id: singleNote[1] } });
  if (path.includes('/api/notes')) return ok({ notes: [NOTE], total: 1, limit: 200, offset: 0 });
  if (path.includes('/api/todos')) return ok({ todos: [TODO], openCount: 1, total: 1 });
  if (path.includes('/api/habits')) {
    return ok({ habits: [HABIT], logs: BOOTSTRAP.habits.logs, today: '2026-10-06', from: '2026-06-17', days: 112 });
  }
  if (path.includes('/api/documents')) {
    return ok({ documents: [DOC], storage: BOOTSTRAP.documents });
  }
  return ok({});
});

function makeApp() {
  return {
    data: null,
    leaveGuard: null,
    shellReady: true,
    async getBootstrap() {
      return BOOTSTRAP;
    },
    invalidate() {},
    setLeaveGuard() {},
    clearLeaveGuard() {},
    setThemeMode() {},
    toggleTheme() {},
    navigate() {},
    async start() {},
  };
}

const PAGES = [
  ['登录页', 'js/views/login.js', 'loginView', []],
  ['首页仪表盘', 'js/views/dashboard.js', 'dashboardView', []],
  ['笔记列表', 'js/views/notes.js', 'notesListView', []],
  ['笔记编辑器', 'js/views/notes.js', 'noteEditorView', ['note_1']],
  ['待办', 'js/views/todos.js', 'todosView', []],
  ['习惯', 'js/views/habits.js', 'habitsView', []],
  ['文档', 'js/views/files.js', 'filesView', []],
  ['设置', 'js/views/settings.js', 'settingsView', []],
];

for (const [label, modulePath, exportName, extraArgs] of PAGES) {
  const url = pathToFileURL(join(publicDir, modulePath)).href;
  try {
    const mod = await import(url);
    const fn = mod[exportName];
    if (typeof fn !== 'function') throw new Error(`没有导出 ${exportName}`);

    const el = makeElement('div');
    await fn(el, makeApp(), ...extraArgs);

    if (!el.innerHTML || el.innerHTML.length < 50) {
      throw new Error('渲染结果为空或过短（' + (el.innerHTML || '').length + ' 字符）');
    }
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${label.padEnd(12)} 渲染出 ${el.innerHTML.length} 字符`);
  } catch (err) {
    failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${label.padEnd(12)} ${err.constructor.name}: ${err.message}`);
    const line = (err.stack || '').split('\n').find((l) => l.includes('public'));
    if (line) console.log(`      ${line.trim()}`);
  }
}

/* 笔记列表的批量删除功能，检查界面元素真的渲染出来了 */
{
  const label = '笔记列表·批量删除';
  try {
    const mod = await import(pathToFileURL(join(publicDir, 'js/views/notes.js')).href);
    const el = makeElement('div');
    await mod.notesListView(el, makeApp());

    const shell = el.innerHTML;
    const rows = el.querySelector('#noteList').innerHTML;

    const problems = [];
    if (!shell.includes('id="selectionBar"')) problems.push('缺少批量操作栏');
    if (!shell.includes('id="selectAll"')) problems.push('缺少「全选」复选框');
    if (!shell.includes('id="deleteSelected"')) problems.push('缺少「删除选中」按钮');
    if (!shell.includes('note-check')) problems.push('缺少复选框样式类');
    if (!rows.includes('data-check=')) problems.push('笔记行里没有复选框');
    if (!rows.includes('note-item__body')) problems.push('笔记行缺少内容容器');

    if (problems.length) throw new Error(problems.join('；'));

    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${label} 操作栏 + ${(rows.match(/data-check=/g) || []).length} 个复选框`);
  } catch (err) {
    failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${label} ${err.message}`);
  }
}

console.log('');

if (capturedErrors.length > 0) {
  failed += capturedErrors.length;
  console.log(`\x1b[31m✗ 启动过程中有 ${capturedErrors.length} 个未处理的异步错误：\x1b[0m`);
  for (const err of capturedErrors) {
    console.log(`      ${err && err.message ? err.message : String(err)}`);
  }
  console.log('');
} else {
  passed++;
  console.log('  \x1b[32m✓\x1b[0m 启动流程没有产生未处理的异步错误');
}

console.log('');
console.log('═'.repeat(58));
if (failed === 0) {
  console.log(`\x1b[32m全部通过\x1b[0m  ${passed} 项检查`);
} else {
  console.log(`\x1b[31m${failed} 项失败\x1b[0m，${passed} 项通过`);
}
console.log('═'.repeat(58));
console.log('');

process.exit(failed === 0 ? 0 : 1);
