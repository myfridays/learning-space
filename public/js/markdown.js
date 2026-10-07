/**
 * 极简 Markdown 渲染器（零依赖，约 200 行）
 * ------------------------------------------------------------------
 * 支持：标题 / 加粗 / 斜体 / 删除线 / 行内代码 / 代码块 /
 *       无序列表 / 有序列表 / 任务列表 / 引用 / 表格 / 分隔线 / 链接 / 图片
 *
 * 安全策略：所有文本先转义再做格式化，链接只允许 http(s) / mailto / # / 相对路径，
 *          所以即使内容里混进 <script> 也不会被执行。
 */

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 行内格式化：输入原始文本，输出安全的 HTML */
function inline(raw) {
  // 1. 先转义，之后的替换都作用在安全文本上
  let s = escapeHtml(raw);

  // 2. 行内代码（先做，避免里面的 * 被当成强调）
  const codes = [];
  s = s.replace(/`([^`\n]+)`/g, (_, code) => {
    const idx = codes.length;
    codes.push(`<code class="md-code">${code}</code>`);
    return `\u0001I${idx}\u0001`;
  });

  // 3. 图片
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => {
    const safeSrc = /^(https?:|\/|data:image\/)/i.test(src) ? src : '';
    if (!safeSrc) return alt;
    return `<img class="md-img" src="${safeSrc}" alt="${alt}" loading="lazy">`;
  });

  // 4. 链接（href 已经是转义过的，不要再转义一次）
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, href) => {
    const safeHref = /^(https?:|mailto:|#|\/)/i.test(href) ? href : '#';
    return `<a class="md-link" href="${safeHref}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  });

  // 5. 强调
  s = s.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
  // 单个下划线做斜体，但加边界限制，避免把 some_var_name 里的 _var_ 也当成斜体
  s = s.replace(
    /(^|[\s(（【「"'])__([^_\n]+)__(?=[\s)）】」"',.!?;:，。！？；：]|$)/g,
    '$1<strong>$2</strong>',
  );
  s = s.replace(
    /(^|[\s(（【「"'])_([^_\n]+)_(?=[\s)）】」"',.!?;:，。！？；：]|$)/g,
    '$1<em>$2</em>',
  );
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // 6. 还原行内代码
  s = s.replace(/\u0001I(\d+)\u0001/g, (_, i) => codes[Number(i)]);

  return s;
}

function splitTableRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((cell) => cell.trim());
}

function renderListItem(raw) {
  const task = /^\[([ xX])\]\s+(.*)$/.exec(raw);
  if (task) {
    const checked = task[1].toLowerCase() === 'x';
    return `<li class="md-task${checked ? ' is-done' : ''}"><span class="md-task-box">${
      checked ? '✓' : ''
    }</span><span>${inline(task[2])}</span></li>`;
  }
  return `<li>${inline(raw)}</li>`;
}

const RE_HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const RE_HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
const RE_QUOTE = /^\s*>\s?/;
const RE_LIST = /^\s*([-*+]|\d+[.)])\s+/;
const RE_LIST_ORDERED = /^\s*\d+[.)]\s+/;
const RE_TABLE_SEP = /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/;

function parseBlocks(text, codeBlocks) {
  const lines = text.split('\n');
  const out = [];
  let i = 0;

  const isBlank = (l) => !l.trim();
  const isPlaceholder = (l) => /^\u0000C(\d+)\u0000$/.test(l.trim());

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) {
      i++;
      continue;
    }

    // 代码块占位符
    if (isPlaceholder(line)) {
      const m = /\u0000C(\d+)\u0000/.exec(line.trim());
      out.push(codeBlocks[Number(m[1])]);
      i++;
      continue;
    }

    // 标题
    const heading = RE_HEADING.exec(line);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    // 分隔线
    if (RE_HR.test(line)) {
      out.push('<hr class="md-hr">');
      i++;
      continue;
    }

    // 引用（可嵌套）
    if (RE_QUOTE.test(line)) {
      const buf = [];
      while (i < lines.length && RE_QUOTE.test(lines[i])) {
        buf.push(lines[i].replace(RE_QUOTE, ''));
        i++;
      }
      out.push(`<blockquote class="md-quote">${parseBlocks(buf.join('\n'), codeBlocks)}</blockquote>`);
      continue;
    }

    // 表格
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      lines[i + 1].includes('-') &&
      RE_TABLE_SEP.test(lines[i + 1])
    ) {
      const header = splitTableRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && !isBlank(lines[i]) && lines[i].includes('|')) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      const head = header.map((c) => `<th>${inline(c)}</th>`).join('');
      const body = rows
        .map(
          (row) =>
            `<tr>${header
              .map((_, idx) => `<td>${inline(row[idx] ?? '')}</td>`)
              .join('')}</tr>`,
        )
        .join('');
      out.push(
        `<div class="md-table-wrap"><table class="md-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`,
      );
      continue;
    }

    // 列表
    if (RE_LIST.test(line)) {
      const ordered = RE_LIST_ORDERED.test(line);
      const items = [];
      while (i < lines.length && RE_LIST.test(lines[i])) {
        items.push(lines[i].replace(RE_LIST, ''));
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(
        `<${tag} class="md-list">${items.map(renderListItem).join('')}</${tag}>`,
      );
      continue;
    }

    // 段落
    const buf = [];
    while (
      i < lines.length &&
      !isBlank(lines[i]) &&
      !isPlaceholder(lines[i]) &&
      !RE_HEADING.test(lines[i]) &&
      !RE_QUOTE.test(lines[i]) &&
      !RE_LIST.test(lines[i]) &&
      !RE_HR.test(lines[i]) &&
      !/^\u0000C\d+\u0000/.test(lines[i].trim())
    ) {
      buf.push(lines[i]);
      i++;
    }
    if (buf.length) {
      out.push(`<p>${inline(buf.join('\n')).replace(/\n/g, '<br>')}</p>`);
    } else {
      i++; // 保险丝，避免死循环
    }
  }

  return out.join('\n');
}

/** 把 Markdown 源码渲染成 HTML 字符串 */
export function renderMarkdown(source) {
  if (source == null || !String(source).trim()) {
    return '<p class="md-empty">还没有内容</p>';
  }

  let text = String(source).replace(/\r\n?/g, '\n');
  const codeBlocks = [];

  // 已闭合的代码块
  text = text.replace(/```([^\n`]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const label = String(lang).trim();
    const idx = codeBlocks.length;
    codeBlocks.push(
      `<pre class="md-pre"${label ? ` data-lang="${escapeHtml(label)}"` : ''}><code>${escapeHtml(
        code.replace(/\n$/, ''),
      )}</code></pre>`,
    );
    return `\u0000C${idx}\u0000`;
  });

  // 还没闭合的代码块（边写边预览时很常见）
  text = text.replace(/```([^\n`]*)\n?([\s\S]*)$/, (_, _lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre class="md-pre md-pre--open"><code>${escapeHtml(code)}</code></pre>`);
    return `\u0000C${idx}\u0000`;
  });

  return parseBlocks(text, codeBlocks);
}

/** 从 Markdown 里提取纯文本，用于列表摘要 */
export function markdownToPlain(source, max = 100) {
  const plain = String(source ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*([-*+]|\d+[.)])\s+/gm, '')
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length <= max ? plain : plain.slice(0, max) + '…';
}
