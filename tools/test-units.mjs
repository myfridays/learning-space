/**
 * 前端工具单元测试（零依赖）
 * ------------------------------------------------------------------
 * 主要目的是把 Markdown 渲染器和 util 里的日期/格式化逻辑都验证一遍，
 * 特别是 XSS 防护——渲染器是唯一把用户输入拼进 HTML 的地方。
 *
 * 用法：node tools/test-units.mjs
 */

import { renderMarkdown, markdownToPlain } from '../public/js/markdown.js';
import {
  debounce,
  esc,
  formatBytes,
  localToday,
  parseTagsInput,
  shiftDay,
  tagsToInput,
  weekdayShort,
} from '../public/js/util.js';

let passed = 0;
let failed = 0;

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
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? `\n      → ${detail}` : ''}`);
  }
}

/* ══════════════════════════════════════════════════════════
   1. XSS 防护（最重要）
   ══════════════════════════════════════════════════════════ */

section('1. XSS 防护');

{
  const html = renderMarkdown('<script>alert(1)</script>');
  check('script 标签被转义', !html.includes('<script>'), html);
  check('尖括号变成实体', html.includes('&lt;script&gt;'));
}

{
  const html = renderMarkdown('<img src=x onerror=alert(1)>');
  check('img onerror 被转义', !html.includes('<img src=x'), html);
}

{
  const html = renderMarkdown('[点我](javascript:alert(1))');
  check('javascript: 伪协议链接被拦截', !html.includes('javascript:'), html);
  check('保留了链接文字', html.includes('点我'));
}

{
  const html = renderMarkdown('[点我](data:text/html,<script>alert(1)</script>)');
  check('data: 伪协议链接被拦截', !html.includes('data:text/html'), html);
}

{
  const html = renderMarkdown('<div onclick="alert(1)">x</div>');
  check('内联事件属性被转义', !html.includes('onclick="alert'), html);
}

{
  const html = renderMarkdown('普通文字 < > & " \' 结束');
  check('常见特殊字符都被转义', html.includes('&amp;') && html.includes('&lt;') && html.includes('&gt;'));
}

/* ══════════════════════════════════════════════════════════
   2. Markdown 块级元素
   ══════════════════════════════════════════════════════════ */

section('2. Markdown 块级元素');

{
  const html = renderMarkdown('# 一级标题');
  check('# 渲染成 h1', html.includes('<h1>一级标题</h1>'), html);

  check('## 渲染成 h2', renderMarkdown('## 二级').includes('<h2>二级</h2>'));
  check('### 渲染成 h3', renderMarkdown('### 三级').includes('<h3>三级</h3>'));
  check('###### 渲染成 h6', renderMarkdown('###### 六级').includes('<h6>六级</h6>'));
  check('标题结尾的 # 被去掉', renderMarkdown('## 标题 ##').includes('<h2>标题</h2>'));
}

{
  const html = renderMarkdown('第一段\n\n第二段');
  check('空行分隔成两个段落', (html.match(/<p>/g) ?? []).length === 2, html);
}

{
  const html = renderMarkdown('第一行\n第二行');
  check('段内换行变成 <br>', html.includes('<br>'), html);
}

{
  check('分隔线', renderMarkdown('---').includes('<hr'), '');
  check('三个星号也是分隔线', renderMarkdown('***').includes('<hr'));
}

{
  const html = renderMarkdown('> 这是一段引用');
  check('引用渲染成 blockquote', html.includes('<blockquote') && html.includes('这是一段引用'), html);
}

{
  const html = renderMarkdown('> 外层\n> > 内层');
  check('引用可以嵌套', (html.match(/<blockquote/g) ?? []).length === 2, html);
}

{
  const html = renderMarkdown('- 苹果\n- 香蕉\n- 橘子');
  check('无序列表', html.includes('<ul') && (html.match(/<li>/g) ?? []).length === 3, html);
}

{
  const html = renderMarkdown('- 苹果\n* 香蕉\n+ 橘子');
  check('三种符号都算列表', (html.match(/<li>/g) ?? []).length === 3, html);
}

{
  const html = renderMarkdown('1. 第一\n2. 第二');
  check('有序列表', html.includes('<ol') && (html.match(/<li>/g) ?? []).length === 2, html);
}

{
  const html = renderMarkdown('- [x] 做完了\n- [ ] 没做完');
  check('任务列表渲染成复选框', (html.match(/<li class="md-task/g) ?? []).length === 2, html);
  check('已完成项带 is-done', html.includes('md-task is-done'));
  check('未完成项没有 is-done 类', (html.match(/md-task-box/g) ?? []).length === 2);
}

{
  const html = renderMarkdown('这是 some_var_name 变量');
  check('下划线变量名不会被误当成斜体', !html.includes('<em>') && html.includes('some_var_name'), html);
}

{
  const html = renderMarkdown('| 项目 | 值 |\n|---|---|\n| 状态 | 正常 |\n| 数量 | 3 |');
  check('表格渲染成 table', html.includes('<table') && html.includes('<thead>'), html);
  check('表头单元格正确', html.includes('<th>项目</th>') && html.includes('<th>值</th>'), html);
  check('表体行数正确', (html.match(/<tr>/g) ?? []).length === 3, html); // 1 表头 + 2 数据
  check('单元格内容正确', html.includes('<td>状态</td>') && html.includes('<td>3</td>'), html);
}

{
  const html = renderMarkdown('```js\nconst a = 1;\n```');
  check('代码块渲染成 pre', html.includes('<pre class="md-pre"') && html.includes('data-lang="js"'), html);
  check('代码内容正确', html.includes('const a = 1;'), html);
  check('代码里的换行被去掉尾部', !html.includes('1;\n</code>'), html);
}

{
  const html = renderMarkdown('```\n没有语言标记\n```');
  check('无语言标记的代码块也正常', html.includes('<pre class="md-pre"') && html.includes('没有语言标记'), html);
  check('无语言时不生成 data-lang', !html.includes('data-lang'), html);
}

{
  const html = renderMarkdown('```js\n还没写完的代码');
  check('未闭合的代码块不会崩', html.includes('还没写完的代码') && html.includes('md-pre--open'), html);
}

{
  const html = renderMarkdown('```\n<script>alert(1)</script>\n```');
  check('代码块里的 script 被转义', !html.includes('<script>'), html);
  check('代码块的转义是实体形式', html.includes('&lt;script&gt;'), html);
}

{
  const html = renderMarkdown('代码块外面的 `行内代码` 和 **粗体**');
  check('行内代码', html.includes('<code class="md-code">行内代码</code>'), html);
  check('粗体', html.includes('<strong>粗体</strong>'), html);
}

{
  const html = renderMarkdown('*斜体* 和 _也是斜体_');
  check('星号斜体', html.includes('<em>斜体</em>'), html);
  check('下划线斜体', html.includes('<em>也是斜体</em>'), html);
}

{
  const html = renderMarkdown('~~删除线~~');
  check('删除线', html.includes('<del>删除线</del>'), html);
}

{
  const html = renderMarkdown('访问 [Cloudflare](https://cloudflare.com) 看看');
  check('正常链接保留', html.includes('href="https://cloudflare.com"'), html);
  check('链接带 noopener', html.includes('rel="noopener noreferrer"'), html);
}

{
  const html = renderMarkdown('![图片](https://example.com/a.png)');
  check('图片正常渲染', html.includes('<img') && html.includes('src="https://example.com/a.png"'), html);
  check('图片带 loading=lazy', html.includes('loading="lazy"'));
}

/* ══════════════════════════════════════════════════════════
   3. 边界情况
   ══════════════════════════════════════════════════════════ */

section('3. 边界情况（不能崩、不能死循环）');

{
  check('null 输入', renderMarkdown(null).includes('md-empty'));
  check('undefined 输入', renderMarkdown(undefined).includes('md-empty'));
  check('空字符串', renderMarkdown('').includes('md-empty'));
  check('只有空白', renderMarkdown('   \n\n  ').includes('md-empty'));
}

{
  let ok = true;
  try {
    renderMarkdown('#####');
    renderMarkdown('|');
    renderMarkdown('>');
    renderMarkdown('-');
    renderMarkdown('```');
    renderMarkdown('```\n');
    renderMarkdown('# '.repeat(200));
    renderMarkdown('\n'.repeat(500));
    renderMarkdown('- '.repeat(300));
    renderMarkdown('*'.repeat(100));
    renderMarkdown('[[');
    renderMarkdown('![', '');
  } catch (err) {
    ok = false;
    console.log('      → 抛异常:', err.message);
  }
  check('各种畸形输入都不抛异常', ok);
}

{
  const start = Date.now();
  renderMarkdown('# 标题\n\n正文 **粗体**\n\n- 列表\n- 列表\n\n> 引用\n\n| A | B |\n|---|---|\n| 1 | 2 |'.repeat(200));
  const ms = Date.now() - start;
  check(`渲染 200 份文档不卡顿（${ms}ms）`, ms < 3000, `${ms}ms`);
}

{
  const html = renderMarkdown('# 标题\n\n普通段落\n\n- 列表项');
  check('混合文档结构正确', html.includes('<h1>') && html.includes('<p>') && html.includes('<li>'), html);
}

{
  const plain = markdownToPlain('# 标题\n\n这是 **正文**，有 `代码` 和 [链接](https://a.com)。\n\n- 列表项');
  check('markdownToPlain 去掉了语法符号', !plain.includes('#') && !plain.includes('**') && !plain.includes(']('), plain);
  check('markdownToPlain 保留了文字', plain.includes('标题') && plain.includes('正文') && plain.includes('列表项'), plain);
}

/* ══════════════════════════════════════════════════════════
   4. util 工具函数
   ══════════════════════════════════════════════════════════ */

section('4. util 工具函数');

{
  check('esc 转义 &', esc('a&b') === 'a&amp;b');
  check('esc 转义 <', esc('a<b') === 'a&lt;b');
  check('esc 转义引号', esc('a"b') === 'a&quot;b');
  check('esc 处理 null', esc(null) === '');
  check('esc 处理数字', esc(42) === '42');
}

{
  const today = localToday();
  check('localToday 格式是 YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(today), today);

  // 关键：不能是 UTC 日期（除非恰好同日）
  const now = new Date();
  const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  check('localToday 用的是本地时区，不是 UTC', today === expected, `得到 ${today}，期望 ${expected}`);
}

{
  check('shiftDay 往前一天', shiftDay('2026-03-01', -1) === '2026-02-28');
  check('shiftDay 往后一天', shiftDay('2026-02-28', 1) === '2026-03-01');
  check('shiftDay 跨年', shiftDay('2026-01-01', -1) === '2025-12-31');
  check('shiftDay 跨闰年', shiftDay('2028-03-01', -1) === '2028-02-29');
  check('shiftDay 大跨度', shiftDay('2026-10-06', -111) === '2026-06-17', shiftDay('2026-10-06', -111));
}

{
  check('weekdayShort 返回中文', ['日', '一', '二', '三', '四', '五', '六'].includes(weekdayShort('2026-10-06')));
}

{
  check('formatBytes 0', formatBytes(0) === '0 B');
  check('formatBytes 字节', formatBytes(512) === '512 B');
  check('formatBytes KB', formatBytes(2048) === '2.0 KB');
  check('formatBytes MB', formatBytes(5 * 1024 * 1024) === '5.0 MB');
  check('formatBytes GB', formatBytes(8 * 1024 * 1024 * 1024) === '8.0 GB');
  check('formatBytes 负数兜底', formatBytes(-5) === '0 B');
  check('formatBytes 非法值兜底', formatBytes(NaN) === '0 B');
}

{
  check('parseTagsInput 逗号分隔', JSON.stringify(parseTagsInput('前端,数据库')) === '["前端","数据库"]');
  check('parseTagsInput 中文逗号', JSON.stringify(parseTagsInput('前端，数据库')) === '["前端","数据库"]');
  check('parseTagsInput 空白分隔', JSON.stringify(parseTagsInput('a b  c')) === '["a","b","c"]');
  check('parseTagsInput 去掉 # 号', JSON.stringify(parseTagsInput('#前端 #数据库')) === '["前端","数据库"]');
  check('parseTagsInput 去重并去空', JSON.stringify(parseTagsInput('a,,  ,a')) === '["a"]');
  check('parseTagsInput 处理 null', JSON.stringify(parseTagsInput(null)) === '[]');

  check('tagsToInput 反向转换', tagsToInput(['前端', '数据库']) === '前端, 数据库');
  check('tagsToInput 处理空', tagsToInput([]) === '');
}

{
  // debounce：应该只在安静下来之后执行一次
  let calls = 0;
  const fn = debounce(() => {
    calls++;
  }, 40);

  fn();
  fn();
  fn();
  check('debounce 连续调用时不立即执行', calls === 0);

  await new Promise((r) => setTimeout(r, 90));
  check('debounce 安静后只执行一次', calls === 1, `实际 ${calls}`);

  fn();
  fn.cancel();
  await new Promise((r) => setTimeout(r, 90));
  check('debounce cancel 能取消', calls === 1, `实际 ${calls}`);

  fn();
  fn.flush();
  check('debounce flush 立即执行', calls === 2, `实际 ${calls}`);
}

/* ── 汇总 ─────────────────────────────────────────────── */

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
