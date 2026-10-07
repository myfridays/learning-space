/** 聚合接口：首页一次性拉全部数据、数据导出 */

import type { Router } from '../router.ts';
import { dateOnly, json, ok } from '../lib.ts';
import {
  countNotes,
  habitsWithStreaks,
  listAllNotes,
  listDocuments,
  listHabitLogs,
  listHabits,
  listNotes,
  listTags,
  listTodos,
  storageUsed,
} from '../db.ts';

const DEFAULT_QUOTA = 8 * 1024 * 1024 * 1024;

function todayFromRequest(url: URL): string {
  return (
    dateOnly(url.searchParams.get('today'), 'today') ??
    new Date().toISOString().slice(0, 10)
  );
}

export function registerData(r: Router) {
  /**
   * 首页一次性拿全所有数据。
   * 这样打开网页只需要 1 次请求，D1 读取次数最少，首屏也最快。
   */
  r.get('/api/bootstrap', async ({ env, url }) => {
    const today = todayFromRequest(url);
    const days = Math.min(Math.max(Number(url.searchParams.get('days') ?? 112) || 112, 7), 730);

    const [recentNotes, noteCount, allTags, todos, habitData, documents, used] =
      await Promise.all([
        listNotes(env.DB, { limit: 6, offset: 0 }),
        countNotes(env.DB),
        listTags(env.DB),
        listTodos(env.DB),
        habitsWithStreaks(env.DB, today, days),
        listDocuments(env.DB),
        storageUsed(env.DB),
      ]);

    const quota = Number(env.STORAGE_QUOTA_BYTES) > 0
      ? Number(env.STORAGE_QUOTA_BYTES)
      : DEFAULT_QUOTA;

    return ok({
      today,
      notes: { recent: recentNotes, total: noteCount, tags: allTags },
      todos: {
        items: todos,
        open: todos.filter((t) => !t.done).length,
        done: todos.filter((t) => t.done).length,
        total: todos.length,
      },
      habits: {
        items: habitData.habits,
        logs: habitData.logs,
        from: habitData.from,
        days,
        bestStreak: habitData.habits.reduce((max, h) => Math.max(max, h.streak), 0),
      },
      documents: {
        items: documents,
        usedBytes: used,
        quotaBytes: quota,
        remainingBytes: Math.max(0, quota - used),
        percent: quota > 0 ? Math.min(100, Math.round((used / quota) * 1000) / 10) : 0,
      },
    });
  });

  /** 统计信息，给设置页用 */
  r.get('/api/data/stats', async ({ env }) => {
    const [noteCount, tags, todos, habits, documents, used] = await Promise.all([
      countNotes(env.DB),
      listTags(env.DB),
      listTodos(env.DB),
      listHabits(env.DB),
      listDocuments(env.DB),
      storageUsed(env.DB),
    ]);
    const quota = Number(env.STORAGE_QUOTA_BYTES) > 0
      ? Number(env.STORAGE_QUOTA_BYTES)
      : DEFAULT_QUOTA;

    return ok({
      notes: { total: noteCount, tags: tags.length, tagList: tags },
      todos: {
        total: todos.length,
        open: todos.filter((t) => !t.done).length,
        done: todos.filter((t) => t.done).length,
      },
      habits: { total: habits.length, active: habits.filter((h) => h.active).length },
      documents: {
        total: documents.length,
        usedBytes: used,
        quotaBytes: quota,
        remainingBytes: Math.max(0, quota - used),
        percent: quota > 0 ? Math.min(100, Math.round((used / quota) * 1000) / 10) : 0,
      },
    });
  });

  /**
   * 导出全部数据为 JSON。
   * 注意：文档只导出元数据，文件本体需要从文档页单独下载。
   * 这是你的「数据可以随时带走」保障。
   */
  r.get('/api/data/export', async ({ env }) => {
    const [notes, todos, habits, habitLogs, documents, used] = await Promise.all([
      listAllNotes(env.DB),
      listTodos(env.DB),
      listHabits(env.DB),
      listHabitLogs(env.DB),
      listDocuments(env.DB),
      storageUsed(env.DB),
    ]);

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const payload = {
      app: 'learning-space',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      counts: {
        notes: notes.length,
        todos: todos.length,
        habits: habits.length,
        habitLogs: habitLogs.length,
        documents: documents.length,
      },
      storage: { usedBytes: used },
      notice:
        '此导出包含笔记 / 待办 / 习惯 / 打卡记录 / 文档元数据。' +
        '文档（PDF 等）的文件本体不在其中，请到「文档」页逐个下载。',
      notes,
      todos,
      habits,
      habitLogs,
      documents,
    };

    return json(payload, {
      headers: {
        'content-disposition': `attachment; filename="learning-space-${stamp}.json"`,
      },
    });
  });
}
