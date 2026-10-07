/** 可复用的界面片段 */

import { esc } from './util.js';

export function emptyState({ icon = '📭', title = '暂无内容', hint = '' } = {}) {
  return `<div class="empty">
    <div class="empty__icon">${icon}</div>
    <div class="empty__title">${esc(title)}</div>
    ${hint ? `<div class="empty__hint">${esc(hint)}</div>` : ''}
  </div>`;
}

export function card({ icon = '', title = '', more = '', body = '', flush = false } = {}) {
  const head = title
    ? `<div class="card__head">
         <h3 class="card__title">${icon ? `<span>${icon}</span>` : ''}${esc(title)}</h3>
         ${more}
       </div>`
    : '';
  return `<section class="card">
    ${head}
    <div class="card__body${flush ? ' card__body--flush' : ''}">${body}</div>
  </section>`;
}

export function statCard({ num, unit = '', label, icon = '' }) {
  return `<div class="stat">
    <div class="stat__num">${esc(num)}${unit ? `<small>${esc(unit)}</small>` : ''}</div>
    <div class="stat__label">${icon ? `${icon} ` : ''}${esc(label)}</div>
  </div>`;
}

/** 任务复选框的勾号图标 */
export const CHECK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9.5 18 20 6.5"/></svg>`;

/**
 * GitHub 风格热力图。
 * days   连续的日期数组（升序，最后一个通常是今天）
 * counts Map<YYYY-MM-DD, number>
 */
export function heatmap({ days, counts, today, label = '' }) {
  if (!days.length) return '';

  const first = new Date(days[0] + 'T00:00:00');
  const padStart = first.getDay(); // 0=周日
  const lastDate = new Date(days[days.length - 1] + 'T00:00:00');
  const padEnd = 6 - lastDate.getDay();

  const cells = [];
  for (let i = 0; i < padStart; i++) {
    cells.push('<i class="heatmap__cell" style="visibility:hidden"></i>');
  }

  let total = 0;
  for (const day of days) {
    const count = counts.get(day) ?? 0;
    total += count;
    const level = count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : count <= 6 ? 3 : 4;
    cells.push(
      `<button type="button" class="heatmap__cell" data-level="${level}" data-day="${day}" title="${day} · ${count} 次"></button>`,
    );
  }
  for (let i = 0; i < padEnd; i++) {
    cells.push('<i class="heatmap__cell is-future" title="未来"></i>');
  }

  const weeks = Math.ceil((days.length + padStart + padEnd) / 7);

  return `<div class="heatmap">
    <div class="heatmap__head">
      <span>${esc(label || `近 ${weeks} 周`)}</span>
      <span>共 ${total} 次</span>
    </div>
    <div class="heatmap__grid">${cells.join('')}</div>
    <div class="heatmap__legend">
      <span>少</span>
      <i data-level="0"></i><i data-level="1"></i><i data-level="2"></i>
      <i data-level="3"></i><i data-level="4"></i>
      <span>多</span>
    </div>
  </div>`;
}

/** 一行键值对 */
export function kv(key, value) {
  return `<div class="kv"><span class="kv__key">${esc(key)}</span><span class="kv__val">${esc(value)}</span></div>`;
}

/** 把「有打卡的日期」聚合成 day -> count 的 Map */
export function countByDay(logs) {
  const map = new Map();
  for (const log of logs) {
    map.set(log.day, (map.get(log.day) ?? 0) + 1);
  }
  return map;
}
