/**
 * 通用工具函数
 */

/** HTML 转义。所有用户输入拼进 innerHTML 之前必须过这一层 */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/* ── 日期 ──────────────────────────────────────────────── */

/** 本地时区的今天，YYYY-MM-DD。绝不要用 toISOString()，那是 UTC */
export function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/** YYYY-MM-DD 加减天数 */
export function shiftDay(day, delta) {
  const d = new Date(day + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export function weekdayShort(day) {
  return ['日', '一', '二', '三', '四', '五', '六'][new Date(day + 'T00:00:00').getDay()];
}

/** 相对时间：3 分钟前 / 昨天 / 2026-09-01 */
export function relativeTime(iso) {
  if (!iso) return '';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';

  const seconds = Math.floor((Date.now() - then.getTime()) / 1000);
  if (seconds < 60) return '刚刚';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;

  const today = localToday();
  const day = `${then.getFullYear()}-${String(then.getMonth() + 1).padStart(2, '0')}-${String(
    then.getDate(),
  ).padStart(2, '0')}`;

  if (day === today) return '今天';
  if (day === shiftDay(today, -1)) return '昨天';
  if (day === shiftDay(today, -2)) return '前天';

  const days = Math.floor((Date.now() - then.getTime()) / 86400000);
  if (days < 30) return `${days} 天前`;
  return day;
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

/** 打卡日期的人话表达 */
export function friendlyDay(day) {
  const today = localToday();
  if (day === today) return '今天';
  if (day === shiftDay(today, -1)) return '昨天';
  const d = new Date(day + 'T00:00:00');
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 周${weekdayShort(day)}`;
}

/* ── 格式化 ────────────────────────────────────────────── */

export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  const value = n / Math.pow(1024, i);
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export function plural(n, unit) {
  return `${n} ${unit}`;
}

/* ── 本地存储（必须包 try/catch）──────────────────────────
   某些浏览器设置下（隐私模式、禁用 Cookie、企业策略）
   访问 localStorage 会直接抛 SecurityError。如果在模块顶层或
   初始化路径上没包住，整个模块会加载失败，页面就是一片空白。
   所以统一走这两个函数。                                        */

export function readStored(key, fallback = null) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

export function writeStored(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/* ── 行为 ──────────────────────────────────────────────── */

export function debounce(fn, wait) {
  let timer = null;
  const wrapped = (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  };
  wrapped.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  wrapped.flush = (...args) => {
    if (timer) clearTimeout(timer);
    timer = null;
    fn(...args);
  };
  wrapped.pending = () => timer !== null;
  return wrapped;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ── 提示 ──────────────────────────────────────────────── */

let toastTimer = null;

export function toast(message, type = 'info') {
  let node = $('#toast');
  if (!node) {
    node = document.createElement('div');
    node.id = 'toast';
    document.body.appendChild(node);
  }
  node.className = `toast toast--${type}`;
  node.textContent = message;
  // 强制重排，让重复调用也能重新触发动画
  void node.offsetWidth;
  node.classList.add('is-visible');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('is-visible'), 2600);
}

/** 简单的确认框。返回 Promise<boolean> */
export function confirmAction(message, { danger = false } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <p class="modal__text">${esc(message)}</p>
        <div class="modal__actions">
          <button class="btn" data-act="cancel">取消</button>
          <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-act="ok">确定</button>
        </div>
      </div>`;

    const close = (value) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(true);
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'cancel') close(false);
      if (act === 'ok') close(true);
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
    overlay.querySelector('[data-act="ok"]')?.focus();
  });
}

/* ── 其它 ──────────────────────────────────────────────── */

/**
 * 把标签输入框的内容解析成数组。
 * - 支持中文逗号、英文逗号、空白分隔
 * - 自动去掉开头的 # 号
 * - 去重、去空、限制 20 个
 * - 去掉引号和反斜杠（避免影响后端的标签匹配）
 */
export function parseTagsInput(value) {
  const out = [];
  const seen = new Set();

  for (const raw of String(value ?? '').split(/[,，\s]+/)) {
    const tag = raw.replace(/^#/, '').replace(/[\\"]/g, '').trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= 20) break;
  }
  return out;
}

export function tagsToInput(tags) {
  return (tags ?? []).join(', ');
}

/** 生成 n 个连续日期，最后一个为 endDay */
export function dayRange(endDay, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(shiftDay(endDay, -i));
  return out;
}
