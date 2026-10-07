/** 习惯打卡接口 */

import type { Router } from '../router.ts';
import { badRequest, dateOnly, json, ok, readJson, str } from '../lib.ts';
import {
  createHabit,
  deleteHabit,
  habitsWithStreaks,
  setHabitLog,
  updateHabit,
} from '../db.ts';

export function registerHabits(r: Router) {
  /**
   * 一次性返回习惯列表 + 打卡记录 + 连续天数。
   * ?today=YYYY-MM-DD  前端本地日期，必传（否则跨时区会算错）
   * ?days=112          回溯多少天，默认 16 周
   */
  r.get('/api/habits', async ({ env, url }) => {
    const today =
      dateOnly(url.searchParams.get('today'), 'today') ??
      new Date().toISOString().slice(0, 10);
    const days = Math.min(Math.max(Number(url.searchParams.get('days') ?? 112) || 112, 7), 730);

    const { habits, logs, from } = await habitsWithStreaks(env.DB, today, days);
    return ok({ habits, logs, today, from, days });
  });

  r.post('/api/habits', async ({ request, env }) => {
    const body = await readJson(request);
    const habit = await createHabit(env.DB, {
      name: str(body.name, 'name', { max: 100, required: true }).trim(),
      icon: str(body.icon, 'icon', { max: 8, def: '✅' }).trim() || '✅',
      color: str(body.color, 'color', { max: 32, def: '#186b5f' }).trim() || '#186b5f',
    });
    return json(
      { habit: { ...habit, streak: 0, checkedToday: false, totalDays: 0 } },
      { status: 201 },
    );
  });

  r.patch('/api/habits/:id', async ({ request, env, params }) => {
    const body = await readJson(request);
    const patch: {
      name?: string;
      icon?: string;
      color?: string;
      active?: boolean;
      sortOrder?: number;
    } = {};

    if ('name' in body) patch.name = str(body.name, 'name', { max: 100, required: true }).trim();
    if ('icon' in body) patch.icon = str(body.icon, 'icon', { max: 8 }).trim() || '✅';
    if ('color' in body) patch.color = str(body.color, 'color', { max: 32 }).trim() || '#186b5f';
    if ('active' in body) patch.active = Boolean(body.active);
    if ('sortOrder' in body) patch.sortOrder = Number(body.sortOrder) || 0;

    const habit = await updateHabit(env.DB, params.id, patch);
    return ok({ habit });
  });

  r.delete('/api/habits/:id', async ({ env, params }) => {
    await deleteHabit(env.DB, params.id);
    return ok({ deleted: params.id });
  });

  /**
   * 打卡 / 取消。
   * body: { day: "YYYY-MM-DD", checked?: boolean }
   * checked 省略时表示「切换」。
   */
  r.post('/api/habits/:id/check', async ({ request, env, params }) => {
    const body = await readJson(request);
    const day = dateOnly(body.day, 'day');
    if (!day) throw badRequest('必须传 day（YYYY-MM-DD）');

    let checked: boolean | undefined;
    if ('checked' in body && body.checked !== undefined && body.checked !== null) {
      if (typeof body.checked !== 'boolean') throw badRequest('checked 必须是布尔值');
      checked = body.checked;
    }

    const result = await setHabitLog(env.DB, params.id, day, checked);
    return ok(result);
  });
}
