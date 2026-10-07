/** 首页仪表盘 */

import { api } from '../api.js';
import { CHECK_SVG, card, countByDay, emptyState, heatmap, statCard } from '../components.js';
import {
  dayRange,
  esc,
  formatBytes,
  localToday,
  relativeTime,
  shiftDay,
  toast,
  weekdayShort,
} from '../util.js';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

function prettyToday() {
  const today = localToday();
  const d = new Date(today + 'T00:00:00');
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 周${weekdayShort(today)}`;
}

function noteRow(note) {
  const tags = note.tags
    .slice(0, 3)
    .map((t) => `<span class="tag tag--static"># ${esc(t)}</span>`)
    .join(' ');
  return `<div class="note-item" data-note="${esc(note.id)}">
    <div class="note-item__title">
      ${note.pinned ? '<span title="已置顶">📌</span>' : ''}
      ${esc(note.title || '无标题')}
    </div>
    <div class="note-item__meta">
      ${tags}
      ${tags ? '<span class="dot"></span>' : ''}
      <span>${esc(relativeTime(note.updatedAt))}</span>
    </div>
    ${note.excerpt ? `<div class="note-item__excerpt">${esc(note.excerpt)}</div>` : ''}
  </div>`;
}

export async function dashboardView(el, app) {
  const data = await app.getBootstrap();
  const today = data.today;

  const readingDocs = data.documents.items.slice(0, 3);
  const openTodos = data.todos.items.filter((t) => !t.done);
  const todayTodos = openTodos.slice(0, 5);
  const logCounts = countByDay(data.habits.logs);
  const days = dayRange(today, data.habits.days);

  const storageTone =
    data.documents.percent >= 90 ? 'bar--danger' : data.documents.percent >= 70 ? 'bar--warn' : '';

  el.innerHTML = `
    <div class="page">
      <div class="page__head">
        <div>
          <h1 class="page__title">${greeting()} 👋</h1>
          <p class="page__sub">${esc(prettyToday())} · 数据实时保存在 Cloudflare D1</p>
        </div>
        <div class="row">
          <button class="btn" id="quickNote">＋ 写笔记</button>
          <button class="btn btn--primary" id="quickTodo">＋ 加待办</button>
        </div>
      </div>

      <div class="stats">
        ${statCard({ num: data.notes.total, unit: '篇', label: '笔记总数', icon: '📝' })}
        ${statCard({
          num: data.documents.items.length,
          unit: '个',
          label: `文档 · 已用 ${formatBytes(data.documents.usedBytes)}`,
          icon: '📄',
        })}
        ${statCard({
          num: data.habits.bestStreak,
          unit: '天',
          label: '最长连续打卡',
          icon: '🔥',
        })}
        ${statCard({
          num: data.todos.open,
          unit: '项',
          label: '待办未完成',
          icon: '✅',
        })}
      </div>

      <div class="grid-2">
        <div class="stack">
          ${card({
            icon: '📝',
            title: '最近笔记',
            more: `<a class="card__more" href="#/notes">全部 ${data.notes.total} 篇 →</a>`,
            flush: true,
            body: data.notes.recent.length
              ? data.notes.recent.map(noteRow).join('')
              : emptyState({
                  icon: '📝',
                  title: '还没有笔记',
                  hint: '点右上角「写笔记」开始记录',
                }),
          })}

          ${card({
            icon: '📄',
            title: '文档',
            more: `<a class="card__more" href="#/files">全部 →</a>`,
            body: `
              ${
                readingDocs.length
                  ? readingDocs
                      .map((doc) => {
                        const pct =
                          doc.totalPages && doc.totalPages > 0
                            ? Math.min(100, Math.round((doc.lastPage / doc.totalPages) * 100))
                            : null;
                        return `<div class="doc-row" style="padding-left:0;padding-right:0" data-doc="${esc(doc.id)}">
                          <div class="doc-row__cover">${doc.contentType.includes('pdf') ? '📕' : '📄'}</div>
                          <div class="doc-row__main">
                            <div class="doc-row__name">${esc(doc.name)}</div>
                            <div class="doc-row__meta">
                              ${formatBytes(doc.sizeBytes)}${
                                doc.totalPages ? ` · 共 ${doc.totalPages} 页` : ''
                              }
                            </div>
                            ${
                              pct !== null
                                ? `<div class="bar"><i class="bar__fill" style="width:${pct}%"></i></div>
                                   <div class="doc-row__foot"><span>第 ${doc.lastPage} 页</span><span class="pct">${pct}%</span></div>`
                                : ''
                            }
                          </div>
                        </div>`;
                      })
                      .join('')
                  : emptyState({ icon: '📄', title: '还没有文档', hint: '可以上传 PDF 在线阅读' })
              }

              <div style="margin-top:16px">
                <div class="row row--between small muted" style="margin-bottom:6px">
                  <span>存储用量</span>
                  <span>${formatBytes(data.documents.usedBytes)} / ${formatBytes(data.documents.quotaBytes)}</span>
                </div>
                <div class="bar ${storageTone}">
                  <i class="bar__fill" style="width:${Math.max(data.documents.percent, 0.6)}%"></i>
                </div>
              </div>
            `,
          })}
        </div>

        <div class="stack">
          ${card({
            icon: '✅',
            title: '今日待办',
            more: `<span class="card__more">${
              data.todos.open
            } 项未完成</span>`,
            flush: true,
            body: todayTodos.length
              ? todayTodos
                  .map(
                    (todo) => `<div class="todo-item${todo.done ? ' is-done' : ''}" data-todo="${esc(todo.id)}">
                      <button class="checkbox" data-act="toggle" aria-label="切换完成">${CHECK_SVG}</button>
                      <div class="todo-item__main">
                        <div class="todo-item__title">${esc(todo.title)}</div>
                        ${
                          todo.dueDate
                            ? `<div class="todo-item__detail">${
                                todo.dueDate < today ? '⚠️ 已逾期 ' : '📅 '
                              }${esc(todo.dueDate)}</div>`
                            : ''
                        }
                      </div>
                      ${
                        todo.priority === 'high'
                          ? '<span class="badge badge--high">紧急</span>'
                          : todo.priority === 'low'
                            ? '<span class="badge badge--low">低</span>'
                            : ''
                      }
                    </div>`,
                  )
                  .join('')
              : emptyState({
                  icon: '🎉',
                  title: '待办都清空了',
                  hint: '点右上角「加待办」添加新的',
                }),
          })}

          ${card({
            icon: '🔥',
            title: '习惯打卡',
            more: `<a class="card__more" href="#/habits">详情 →</a>`,
            flush: true,
            body: `
              ${
                data.habits.items.length
                  ? data.habits.items
                      .map(
                        (habit) => `<div class="habit-row" data-habit="${esc(habit.id)}">
                          <span class="habit-row__icon">${esc(habit.icon)}</span>
                          <div class="habit-row__main">
                            <div class="habit-row__name">${esc(habit.name)}</div>
                            <div class="habit-row__streak">🔥 连续 <b>${habit.streak}</b> 天 · 累计 ${habit.totalDays} 天</div>
                          </div>
                          <button class="check-btn${habit.checkedToday ? ' is-on' : ''}"
                                  data-act="check" data-day="${today}"
                                  title="${habit.checkedToday ? '取消今天打卡' : '今天打卡'}">
                            ${habit.checkedToday ? '✓' : ''}
                          </button>
                        </div>`,
                      )
                      .join('')
                  : emptyState({ icon: '🔥', title: '还没有习惯', hint: '到「习惯」页添加一个' })
              }
              ${heatmap({ days, counts: logCounts, today })}
            `,
          })}
        </div>
      </div>
    </div>`;

  /* ── 交互 ─────────────────────────────────────────────── */

  el.querySelector('#quickNote')?.addEventListener('click', async () => {
    try {
      const { note } = await api.notes.create({
        title: '无标题',
        content: '',
        tags: [],
      });
      app.invalidate();
      app.navigate(`#/notes/${note.id}`);
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  el.querySelector('#quickTodo')?.addEventListener('click', () => {
    app.navigate('#/todos');
  });

  el.addEventListener('click', async (event) => {
    // 打开笔记
    const noteItem = event.target.closest('[data-note]');
    if (noteItem) {
      app.navigate(`#/notes/${noteItem.dataset.note}`);
      return;
    }

    // 打开文档
    const docRow = event.target.closest('[data-doc]');
    if (docRow) {
      app.navigate(`#/files/${docRow.dataset.doc}`);
      return;
    }

    // 切换待办
    const toggle = event.target.closest('[data-act="toggle"]');
    if (toggle) {
      const row = toggle.closest('[data-todo]');
      const id = row.dataset.todo;
      const willBeDone = !row.classList.contains('is-done');
      row.classList.toggle('is-done', willBeDone);
      try {
        await api.todos.update(id, { done: willBeDone });
        app.invalidate();
        toast(willBeDone ? '已完成 ✓' : '已恢复为未完成', 'success');
      } catch (err) {
        row.classList.toggle('is-done', !willBeDone);
        toast(err.message, 'error');
      }
      return;
    }

    // 习惯打卡
    const check = event.target.closest('[data-act="check"]');
    if (check) {
      const row = check.closest('[data-habit]');
      const id = row.dataset.habit;
      const day = check.dataset.day;
      const wasOn = check.classList.contains('is-on');
      check.classList.toggle('is-on', !wasOn);
      check.textContent = wasOn ? '' : '✓';
      try {
        await api.habits.check(id, day, !wasOn);
        app.invalidate();
        toast(wasOn ? '已取消打卡' : '打卡成功 🔥', 'success');
      } catch (err) {
        check.classList.toggle('is-on', wasOn);
        check.textContent = wasOn ? '✓' : '';
        toast(err.message, 'error');
      }
    }
  });
}
