/** 笔记接口 */

import type { Router } from '../router.ts';
import { badRequest, bool, json, notFound, ok, pagination, readJson, str, tags } from '../lib.ts';
import {
  countNotes,
  createNote,
  deleteNote,
  deleteNotes,
  getNote,
  listNotes,
  listTags,
  updateNote,
} from '../db.ts';

export function registerNotes(r: Router) {
  // 列表，支持 ?q= 关键词 和 ?tag= 标签过滤
  r.get('/api/notes', async ({ env, url }) => {
    const { limit, offset } = pagination(url);
    const q = url.searchParams.get('q') ?? '';
    const tag = url.searchParams.get('tag') ?? '';

    const [notes, total] = await Promise.all([
      listNotes(env.DB, { q, tag, limit, offset }),
      countNotes(env.DB),
    ]);

    return ok({ notes, total, limit, offset });
  });

  // 所有标签及计数
  r.get('/api/notes/tags', async ({ env }) => {
    return ok({ tags: await listTags(env.DB) });
  });

  /**
   * 批量删除。必须注册在 /api/notes/:id 之前，
   * 否则 'batch-delete' 会被当成一篇笔记的 id。
   */
  r.post('/api/notes/batch-delete', async ({ request, env }) => {
    const body = await readJson(request);
    const raw = body.ids;

    if (!Array.isArray(raw)) throw badRequest('ids 必须是数组');
    if (raw.length === 0) throw badRequest('ids 不能为空');
    if (raw.length > 500) throw badRequest('一次最多删除 500 篇');

    const ids = raw.map((v) => String(v)).filter(Boolean);
    const deleted = await deleteNotes(env.DB, ids);

    return ok({ deleted, requested: ids.length });
  });

  r.get('/api/notes/:id', async ({ env, params }) => {
    const note = await getNote(env.DB, params.id);
    if (!note) throw notFound('笔记不存在');
    return ok({ note });
  });

  r.post('/api/notes', async ({ request, env }) => {
    const body = await readJson(request);
    const note = await createNote(env.DB, {
      title: str(body.title, 'title', { max: 300, def: '无标题' }).trim() || '无标题',
      content: str(body.content, 'content', { max: 500_000 }),
      tags: tags(body.tags),
      pinned: bool(body.pinned, 'pinned'),
    });
    return json({ note }, { status: 201 });
  });

  // 自动保存走 PATCH：只传改动过的字段，其余保持原样
  r.patch('/api/notes/:id', async ({ request, env, params }) => {
    const body = await readJson(request);
    const patch: { title?: string; content?: string; tags?: string; pinned?: boolean } = {};

    if ('title' in body) {
      patch.title = str(body.title, 'title', { max: 300 }).trim() || '无标题';
    }
    if ('content' in body) {
      patch.content = str(body.content, 'content', { max: 500_000 });
    }
    if ('tags' in body) {
      patch.tags = tags(body.tags);
    }
    if ('pinned' in body) {
      patch.pinned = bool(body.pinned, 'pinned');
    }

    if (Object.keys(patch).length === 0) {
      const note = await getNote(env.DB, params.id);
      if (!note) throw notFound('笔记不存在');
      return ok({ note });
    }

    const note = await updateNote(env.DB, params.id, patch);
    return ok({ note });
  });

  r.delete('/api/notes/:id', async ({ env, params }) => {
    await deleteNote(env.DB, params.id);
    return ok({ deleted: params.id });
  });
}
