/** 习惯打卡 */

import { api } from '../api.js';
import { card, countByDay, emptyState, heatmap } from '../components.js';
import {
  confirmAction,
  dayRange,
  esc,
  localToday,
  shiftDay,
  toast,
  weekdayShort,
} from '../util.js';

const ICON_CHOICES = ['📖', '💻', '✍️', '🏃', '🧘', '💧', '🌱', '🎧', '🍎', '😴', '🎯', '🔥'];

export async function habitsView(el, app) {
  const data = await api.habits.list(112);
  const today = localToday();

  el.innerHTML = `
    <div class="page page--narrow">
      <div class="page__head">
        <div>
          <h1 class="page__title">🔥 习惯</h1>
          <p class="page__sub">最长连续 ${data.habits.reduce((m, h) => Math.max(m, h.streak), 0)} 天 · 共 ${
            data.habits.length
          } 个习惯</p>
        </div>
        <button class="btn btn--primary" id="addBtn">＋ 添加习惯</button>
      </div>

      <div id="addPanel" hidden style="margin-bottom:20px"></div>

      <div class="stack">
        <section class="card">
          <div class="card__head">
            <h3 class="card__title"><span>📋</span>我的习惯</h3>
            <span class="card__more">点小圆点可以补打卡</span>
          </div>
          <div class="card__body card__body--flush" id="habitList"></div>
        </section>

        ${card({
          icon: '📊',
          title: '打卡热力图',
          flush: true,
          body: heatmap({
            days: dayRange(today, 112),
            counts: countByDay(data.logs),
            today,
          }),
        })}
      </div>
    </div>`;

  const listBox = el.querySelector('#habitList');
  const addPanel = el.querySelector('#addPanel');

  /* ── 渲染列表 ── */

  function weekStrip(habit) {
    const days = dayRange(today, 7);
    const logSet = new Set(
      data.logs.filter((l) => l.habitId === habit.id).map((l) => l.day),
    );
    return `<div class="row" style="gap:4px;margin-top:6px">
      ${days
        .map((day) => {
          const on = logSet.has(day);
          const isToday = day === today;
          return `<button class="week-day__dot${on ? ' is-on' : ''}${
            isToday ? ' is-today' : ''
          }" data-act="toggle-day" data-habit="${esc(habit.id)}" data-day="${day}"
            title="${day} 周${weekdayShort(day)} · ${on ? '已打卡，点击取消' : '未打卡，点击补打'}"
            style="width:26px;height:26px;font-size:11px">${on ? '✓' : ''}</button>`;
        })
        .join('')}
      <span class="small muted" style="margin-left:6px">
        ${weekdaysHeader()}
      </span>
    </div>`;
  }

  function weekdaysHeader() {
    return dayRange(today, 7)
      .map((d) => weekdayShort(d))
      .join(' ');
  }

  function renderList() {
    if (!data.habits.length) {
      listBox.innerHTML = emptyState({
        icon: '🔥',
        title: '还没有习惯',
        hint: '点右上角「添加习惯」，先从一个开始',
      });
      return;
    }

    listBox.innerHTML = data.habits
      .map(
        (habit) => `<div class="habit-row" data-habit="${esc(habit.id)}" style="flex-wrap:wrap">
          <span class="habit-row__icon">${esc(habit.icon)}</span>
          <div class="habit-row__main">
            <div class="habit-row__name">${esc(habit.name)}</div>
            <div class="habit-row__streak">
              🔥 连续 <b>${habit.streak}</b> 天 · 累计 ${habit.totalDays} 天
            </div>
            ${weekStrip(habit)}
          </div>
          <div class="habit-row__actions">
            <button class="check-btn${habit.checkedToday ? ' is-on' : ''}"
                    data-act="toggle-today"
                    title="${habit.checkedToday ? '取消今天打卡' : '今天打卡'}"
                    style="width:34px;height:34px;font-size:15px">
              ${habit.checkedToday ? '✓' : ''}
            </button>
            <button class="btn btn--ghost btn--sm" data-act="delete" title="删除习惯">✕</button>
          </div>
        </div>`,
      )
      .join('');
  }

  /* ── 添加习惯面板 ── */

  el.querySelector('#addBtn').addEventListener('click', () => {
    if (!addPanel.hidden) {
      addPanel.hidden = true;
      return;
    }
    addPanel.hidden = false;
    addPanel.innerHTML = `<section class="card">
      <div class="card__body">
        <form id="habitForm">
          <div class="row row--wrap" style="gap:10px;align-items:flex-end">
            <div class="field" style="flex:1;min-width:160px">
              <label class="field__label" for="habitName">习惯名称</label>
              <input class="input" id="habitName" placeholder="例如：阅读 30 分钟" required autocomplete="off">
            </div>
            <div class="field" style="flex:none">
              <label class="field__label">图标</label>
              <div class="row row--wrap" style="gap:4px" id="iconPicker">
                ${ICON_CHOICES.map(
                  (icon, i) =>
                    `<button type="button" class="tag${i === 0 ? ' is-active' : ''}" data-icon="${icon}"
                       style="font-size:16px;padding:5px 9px">${icon}</button>`,
                ).join('')}
              </div>
            </div>
            <button class="btn btn--primary" type="submit">创建</button>
          </div>
        </form>
      </div>
    </section>`;

    let chosenIcon = ICON_CHOICES[0];
    const iconPicker = addPanel.querySelector('#iconPicker');
    iconPicker.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-icon]');
      if (!btn) return;
      chosenIcon = btn.dataset.icon;
      iconPicker.querySelectorAll('[data-icon]').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
    });

    addPanel.querySelector('#habitForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = addPanel.querySelector('#habitName').value.trim();
      if (!name) return;
      try {
        await api.habits.create({ name, icon: chosenIcon });
        toast('已创建', 'success');
        app.invalidate();
        await reload();
        addPanel.hidden = true;
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    addPanel.querySelector('#habitName').focus();
  });

  async function reload() {
    const fresh = await api.habits.list(112);
    data.habits = fresh.habits;
    data.logs = fresh.logs;
    renderList();
  }

  /* ── 交互 ── */

  listBox.addEventListener('click', async (event) => {
    const act = event.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    const button = event.target.closest('[data-act]');

    // 今天打卡
    if (act === 'toggle-today') {
      const row = button.closest('[data-habit]');
      const id = row.dataset.habit;
      const habit = data.habits.find((h) => h.id === id);
      if (!habit) return;
      const willCheck = !habit.checkedToday;

      button.classList.toggle('is-on', willCheck);
      button.textContent = willCheck ? '✓' : '';
      try {
        await api.habits.check(id, today, willCheck);
        app.invalidate();
        toast(willCheck ? '打卡成功 🔥' : '已取消', 'success');
        await reload();
      } catch (err) {
        button.classList.toggle('is-on', !willCheck);
        button.textContent = willCheck ? '' : '✓';
        toast(err.message, 'error');
      }
      return;
    }

    // 补打卡某一天
    if (act === 'toggle-day') {
      const id = button.dataset.habit;
      const day = button.dataset.day;
      const wasOn = button.classList.contains('is-on');
      button.classList.toggle('is-on', !wasOn);
      button.textContent = wasOn ? '' : '✓';
      try {
        await api.habits.check(id, day, !wasOn);
        app.invalidate();
        await reload();
      } catch (err) {
        button.classList.toggle('is-on', wasOn);
        button.textContent = wasOn ? '✓' : '';
        toast(err.message, 'error');
      }
      return;
    }

    // 删除
    if (act === 'delete') {
      const row = button.closest('[data-habit]');
      const habit = data.habits.find((h) => h.id === row.dataset.habit);
      if (!habit) return;
      const yes = await confirmAction(
        `删除「${habit.name}」会同时删掉它的所有打卡记录（${habit.totalDays} 天），确定吗？`,
        { danger: true },
      );
      if (!yes) return;
      try {
        await api.habits.remove(habit.id);
        app.invalidate();
        await reload();
        toast('已删除', 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
    }
  });

  renderList();
}
