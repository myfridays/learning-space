/** 待办接口 */

import type { Router } from '../router.ts';
import { badRequest, bool, dateOnly, json, ok, readJson, str } from '../lib.ts';
import { createTodo, deleteTodo, listTodos, updateTodo } from '../db.ts';

const PRIORITIES = ['low', 'normal', 'high'];

function parsePriority(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'normal';
  const p = String(value);
  if (!PRIORITIES.includes(p)) {
    throw badRequest(`priority 只能是 ${PRIORITIES.join(' / ')}`);
  }
  return p;
}

export function registerTodos(r: Router) {
  r.get('/api/todos', async ({ env }) => {
    const todos = await listTodos(env.DB);
    return ok({
      todos,
      openCount: todos.filter((t) => !t.done).length,
      total: todos.length,
    });
  });

  r.post('/api/todos', async ({ request, env }) => {
    const body = await readJson(request);
    const todo = await createTodo(env.DB, {
      title: str(body.title, 'title', { max: 500, required: true }).trim(),
      detail: str(body.detail, 'detail', { max: 5000 }),
      priority: parsePriority(body.priority),
      dueDate: dateOnly(body.dueDate, 'dueDate'),
    });
    return json({ todo }, { status: 201 });
  });

  r.patch('/api/todos/:id', async ({ request, env, params }) => {
    const body = await readJson(request);
    const patch: {
      title?: string;
      detail?: string;
      priority?: string;
      done?: boolean;
      dueDate?: string | null;
      sortOrder?: number;
    } = {};

    if ('title' in body) {
      patch.title = str(body.title, 'title', { max: 500, required: true }).trim();
    }
    if ('detail' in body) patch.detail = str(body.detail, 'detail', { max: 5000 });
    if ('priority' in body) patch.priority = parsePriority(body.priority);
    if ('done' in body) patch.done = bool(body.done, 'done');
    if ('dueDate' in body) patch.dueDate = dateOnly(body.dueDate, 'dueDate');
    if ('sortOrder' in body) patch.sortOrder = Number(body.sortOrder) || 0;

    const todo = await updateTodo(env.DB, params.id, patch);
    return ok({ todo });
  });

  r.delete('/api/todos/:id', async ({ env, params }) => {
    await deleteTodo(env.DB, params.id);
    return ok({ deleted: params.id });
  });
}
