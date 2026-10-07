/** 待办 */

import { api } from '../api.js';
import { CHECK_SVG, emptyState } from '../components.js';
import { confirmAction, esc, localToday, toast } from '../util.js';

const PRIORITY_LABEL = { high: '紧急', normal: '普通', low: '低' };

export async function todosView(el, app) {
  const data = await api.todos.list();
  let filter = 'open'; // all | open | done

  el.innerHTML = `
    <div class="page page--narrow">
      <div class="page__head">
        <div>
          <h1 class="page__title">✅ 待办</h1>
          <p class="page__sub">${data.openCount} 项未完成 · 共 ${data.total} 项</p>
        </div>
      </div>

      <section class="card" style="margin-bottom:20px">
        <div class="card__body">
          <form id="addForm" class="row row--wrap" style="gap:10px;align-items:flex-start">
            <input class="input" id="addTitle" placeholder="要做点什么？" required
                   style="flex:1;min-width:200px" autocomplete="off">
            <select class="select" id="addPriority" style="width:auto;flex:none">
              <option value="normal">普通</option>
              <option value="high">紧急</option>
              <option value="low">低</option>
            </select>
            <input class="input" id="addDue" type="date" style="width:auto;flex:none" title="截止日期">
            <button class="btn btn--primary" type="submit" style="flex:none">添加</button>
          </form>
        </div>
      </section>

      <div class="row" style="margin-bottom:14px;gap:7px" id="filterBar">
        <button class="tag" data-filter="open">未完成</button>
        <button class="tag" data-filter="all">全部</button>
        <button class="tag" data-filter="done">已完成</button>
        <span class="spacer"></span>
        <button class="btn btn--ghost btn--sm" id="clearDone">清除已完成</button>
      </div>

      <div class="card">
        <div class="card__body card__body--flush" id="todoList"></div>
      </div>
    </div>`;

  const listBox = el.querySelector('#todoList');
  const filterBar = el.querySelector('#filterBar');
  const addForm = el.querySelector('#addForm');
  const addTitle = el.querySelector('#addTitle');
  const addPriority = el.querySelector('#addPriority');
  const addDue = el.querySelector('#addDue');

  const today = localToday();

  function visible() {
    if (filter === 'open') return data.todos.filter((t) => !t.done);
    if (filter === 'done') return data.todos.filter((t) => t.done);
    return data.todos;
  }

  function renderFilterBar() {
    filterBar.querySelectorAll('[data-filter]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.filter === filter);
    });
    el.querySelector('#clearDone').hidden = data.todos.filter((t) => t.done).length === 0;
  }

  function renderList() {
    const items = visible();
    if (!items.length) {
      listBox.innerHTML = emptyState({
        icon: filter === 'done' ? '📭' : '🎉',
        title:
          filter === 'done'
            ? '还没有已完成的待办'
            : filter === 'all'
              ? '还没有待办'
              : '待办都清空了',
        hint: filter === 'open' ? '休息一下，或者添加新的任务' : '在上面添加一条',
      });
      return;
    }

    listBox.innerHTML = items
      .map((todo) => {
        const overdue = todo.dueDate && !todo.done && todo.dueDate < today;
        const dueToday = todo.dueDate && !todo.done && todo.dueDate === today;
        let dueText = '';
        if (todo.dueDate) {
          dueText = overdue
            ? `<span style="color:var(--danger)">⚠️ 逾期 ${esc(todo.dueDate)}</span>`
            : dueToday
              ? '<span style="color:var(--warn)">📅 今天截止</span>'
              : `📅 ${esc(todo.dueDate)}`;
        }

        return `<div class="todo-item${todo.done ? ' is-done' : ''}" data-id="${esc(todo.id)}">
          <button class="checkbox" data-act="toggle" aria-label="切换完成">${CHECK_SVG}</button>
          <div class="todo-item__main">
            <div class="todo-item__title" data-act="edit" title="点击编辑">${esc(todo.title)}</div>
            ${
              todo.detail || dueText
                ? `<div class="todo-item__detail">${
                    todo.detail ? esc(todo.detail) + (dueText ? ' · ' : '') : ''
                  }${dueText}</div>`
                : ''
            }
          </div>
          ${
            todo.priority === 'normal'
              ? ''
              : `<span class="badge badge--${todo.priority}">${PRIORITY_LABEL[todo.priority]}</span>`
          }
          <div class="todo-item__actions">
            <button class="btn btn--ghost btn--sm" data-act="delete" title="删除">✕</button>
          </div>
        </div>`;
      })
      .join('');
  }

  /* ── 事件 ── */

  addForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = addTitle.value.trim();
    if (!title) return;

    try {
      await api.todos.create({
        title,
        priority: addPriority.value,
        dueDate: addDue.value || null,
      });
      addTitle.value = '';
      addDue.value = '';
      addPriority.value = 'normal';
      await reload();
      toast('已添加', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  async function reload() {
    const fresh = await api.todos.list();
    data.todos = fresh.todos;
    data.total = fresh.total;
    data.openCount = fresh.openCount;
    app.invalidate();
    renderFilterBar();
    renderList();
    const sub = el.querySelector('.page__sub');
    if (sub) sub.textContent = `${data.openCount} 项未完成 · 共 ${data.total} 项`;
  }

  filterBar.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-filter]');
    if (!btn) return;
    filter = btn.dataset.filter;
    renderFilterBar();
    renderList();
  });

  el.querySelector('#clearDone').addEventListener('click', async () => {
    const doneItems = data.todos.filter((t) => t.done);
    const yes = await confirmAction(`确定要删除 ${doneItems.length} 项已完成的待办吗？`, {
      danger: true,
    });
    if (!yes) return;
    try {
      for (const todo of doneItems) await api.todos.remove(todo.id);
      await reload();
      toast(`已清除 ${doneItems.length} 项`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  listBox.addEventListener('click', async (event) => {
    const row = event.target.closest('[data-id]');
    if (!row) return;
    const id = row.dataset.id;
    const todo = data.todos.find((t) => t.id === id);
    if (!todo) return;

    const act = event.target.closest('[data-act]')?.dataset.act;

    if (act === 'toggle') {
      const willBeDone = !todo.done;
      row.classList.toggle('is-done', willBeDone);
      try {
        await api.todos.update(id, { done: willBeDone });
        todo.done = willBeDone;
        app.invalidate();
        if (filter !== 'all') {
          setTimeout(() => reload(), 260);
        } else {
          reload();
        }
      } catch (err) {
        row.classList.toggle('is-done', !willBeDone);
        toast(err.message, 'error');
      }
      return;
    }

    if (act === 'delete') {
      try {
        await api.todos.remove(id);
        await reload();
        toast('已删除', 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
      return;
    }

    if (act === 'edit') {
      const titleEl = row.querySelector('.todo-item__title');
      const original = todo.title;
      const input = document.createElement('input');
      input.className = 'input input--flush';
      input.value = original;
      titleEl.replaceWith(input);
      input.focus();
      input.setSelectionRange(original.length, original.length);

      let settled = false;
      const commit = async () => {
        if (settled) return;
        settled = true;
        const next = input.value.trim();
        if (!next || next === original) {
          renderList();
          return;
        }
        try {
          await api.todos.update(id, { title: next });
          todo.title = next;
          app.invalidate();
          toast('已保存', 'success');
        } catch (err) {
          toast(err.message, 'error');
        }
        renderList();
      };

      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (keyEvent) => {
        if (keyEvent.key === 'Enter') {
          keyEvent.preventDefault();
          commit();
        }
        if (keyEvent.key === 'Escape') {
          settled = true;
          renderList();
        }
      });
    }
  });

  renderFilterBar();
  renderList();
}
