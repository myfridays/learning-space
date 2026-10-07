/**
 * 数据层：所有 SQL 都集中在这个文件里
 * ------------------------------------------------------------------
 * 设计原则：
 *   1. 全部使用参数绑定（?），杜绝 SQL 注入
 *   2. 返回给前端的对象在这里统一做形状转换（snake_case → camelCase，
 *      JSON 字符串 → 数组，0/1 → 布尔）
 *   3. 日期只做「存储」，不做「计算」。习惯打卡的 day 由前端传本地日期，
 *      避免服务器 UTC 时区把深夜打卡算到第二天
 */

import type {
  D1Database,
  DocumentRow,
  HabitLogRow,
  HabitRow,
  NoteRow,
  TodoRow,
} from './types.ts';
import { excerpt, newId, notFound, nowIso } from './lib.ts';

/* ── 输出形状 ──────────────────────────────────────────── */

export interface NoteDTO {
  id: string;
  title: string;
  content: string;
  excerpt: string;
  tags: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TodoDTO {
  id: string;
  title: string;
  detail: string;
  priority: 'low' | 'normal' | 'high';
  done: boolean;
  dueDate: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  doneAt: string | null;
}

export interface HabitDTO {
  id: string;
  name: string;
  icon: string;
  color: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface HabitLogDTO {
  habitId: string;
  day: string;
  count: number;
  note: string;
}

export interface DocumentDTO {
  id: string;
  name: string;
  sizeBytes: number;
  contentType: string;
  createdAt: string;
  lastPage: number;
  totalPages: number | null;
  openedAt: string | null;
}

/* ── 映射 ──────────────────────────────────────────────── */

function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function toNote(row: NoteRow): NoteDTO {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    excerpt: excerpt(row.content || row.title),
    tags: parseTags(row.tags),
    pinned: row.pinned === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toTodo(row: TodoRow): TodoDTO {
  const priority = ['low', 'normal', 'high'].includes(row.priority)
    ? (row.priority as TodoDTO['priority'])
    : 'normal';
  return {
    id: row.id,
    title: row.title,
    detail: row.detail,
    priority,
    done: row.done === 1,
    dueDate: row.due_date,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    doneAt: row.done_at,
  };
}

export function toHabit(row: HabitRow): HabitDTO {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    active: row.active === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

export function toDocument(row: DocumentRow): DocumentDTO {
  return {
    id: row.id,
    name: row.name,
    sizeBytes: row.size_bytes,
    contentType: row.content_type,
    createdAt: row.created_at,
    lastPage: row.last_page,
    totalPages: row.total_pages,
    openedAt: row.opened_at,
  };
}

/* ── 笔记 ──────────────────────────────────────────────── */

/** 转义 LIKE 通配符，防止用户输入 % 或 _ 时匹配到意料之外的内容 */
function likePattern(keyword: string): string {
  const escaped = keyword.replace(/[\\%_]/g, (ch) => '\\' + ch);
  return `%${escaped}%`;
}

export async function listNotes(
  db: D1Database,
  opts: { q?: string; tag?: string; limit: number; offset: number },
): Promise<NoteDTO[]> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (opts.q && opts.q.trim()) {
    const p = likePattern(opts.q.trim());
    where.push("(title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\')");
    params.push(p, p);
  }
  if (opts.tag && opts.tag.trim()) {
    // 标签以 JSON 数组形式存储，用 "标签" 精确匹配其中的一项
    const tag = opts.tag.trim().replace(/[\\%_"]/g, '');
    if (tag) {
      where.push("tags LIKE ? ESCAPE '\\'");
      params.push(`%"${tag}"%`);
    }
  }

  const sql = `
    SELECT * FROM notes
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY pinned DESC, updated_at DESC
    LIMIT ? OFFSET ?
  `;
  params.push(opts.limit, opts.offset);

  const { results } = await db.prepare(sql).bind(...params).all<NoteRow>();
  return results.map(toNote);
}

export async function getNote(db: D1Database, id: string): Promise<NoteDTO | null> {
  const row = await db.prepare('SELECT * FROM notes WHERE id = ?').bind(id).first<NoteRow>();
  return row ? toNote(row) : null;
}

export async function countNotes(db: D1Database): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM notes')
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

/** 统计所有标签及出现次数，按次数倒序 */
export async function listTags(db: D1Database): Promise<Array<{ tag: string; count: number }>> {
  const { results } = await db.prepare('SELECT tags FROM notes').all<{ tags: string }>();
  const counter = new Map<string, number>();
  for (const row of results) {
    for (const tag of parseTags(row.tags)) {
      counter.set(tag, (counter.get(tag) ?? 0) + 1);
    }
  }
  return [...counter.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export async function createNote(
  db: D1Database,
  input: { title: string; content: string; tags: string; pinned: boolean },
): Promise<NoteDTO> {
  const now = nowIso();
  const id = newId('note_');
  await db
    .prepare(
      `INSERT INTO notes (id, title, content, tags, pinned, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, input.title, input.content, input.tags, input.pinned ? 1 : 0, now, now)
    .run();
  const created = await getNote(db, id);
  if (!created) throw new Error('笔记创建后读取失败');
  return created;
}

/** 局部更新：只覆盖传进来的字段，没传的保持原值 */
export async function updateNote(
  db: D1Database,
  id: string,
  patch: { title?: string; content?: string; tags?: string; pinned?: boolean },
): Promise<NoteDTO> {
  const existing = await db.prepare('SELECT * FROM notes WHERE id = ?').bind(id).first<NoteRow>();
  if (!existing) throw notFound('笔记不存在');

  const title = patch.title ?? existing.title;
  const content = patch.content ?? existing.content;
  const tags = patch.tags ?? existing.tags;
  const pinned = patch.pinned === undefined ? existing.pinned : patch.pinned ? 1 : 0;

  await db
    .prepare(
      `UPDATE notes SET title = ?, content = ?, tags = ?, pinned = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(title, content, tags, pinned, nowIso(), id)
    .run();

  const updated = await getNote(db, id);
  if (!updated) throw notFound('笔记不存在');
  return updated;
}

export async function deleteNote(db: D1Database, id: string): Promise<void> {
  const res = await db.prepare('DELETE FROM notes WHERE id = ?').bind(id).run();
  const changes = Number((res.meta as { changes?: number })?.changes ?? 0);
  if (changes === 0) throw notFound('笔记不存在');
}

/**
 * 批量删除笔记，返回实际删掉的条数。
 *
 * 返回值可能小于传入的 ids 数量——因为有些可能已经被删过了，
 * 或者根本不存在。这种情况不算错误，前端只需要知道删了几篇。
 *
 * 为什么要分批：SQLite 单条语句的绑定变量数量有上限（默认 999 个），
 * 一次删几百篇就必须拆成多条语句。
 */
export async function deleteNotes(db: D1Database, ids: string[]): Promise<number> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return 0;

  const CHUNK = 100;
  let deleted = 0;

  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '?').join(', ');
    const res = await db
      .prepare(`DELETE FROM notes WHERE id IN (${placeholders})`)
      .bind(...chunk)
      .run();
    deleted += Number((res.meta as { changes?: number })?.changes ?? 0);
  }

  return deleted;
}

/* ── 待办 ──────────────────────────────────────────────── */

export async function listTodos(db: D1Database): Promise<TodoDTO[]> {
  const { results } = await db
    .prepare('SELECT * FROM todos ORDER BY done ASC, sort_order ASC, created_at DESC')
    .all<TodoRow>();
  return results.map(toTodo);
}

export async function getTodo(db: D1Database, id: string): Promise<TodoDTO | null> {
  const row = await db.prepare('SELECT * FROM todos WHERE id = ?').bind(id).first<TodoRow>();
  return row ? toTodo(row) : null;
}

export async function createTodo(
  db: D1Database,
  input: {
    title: string;
    detail: string;
    priority: string;
    dueDate: string | null;
  },
): Promise<TodoDTO> {
  const now = nowIso();
  const id = newId('todo_');
  const maxRow = await db
    .prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM todos')
    .first<{ m: number }>();
  const sortOrder = Number(maxRow?.m ?? 0) + 1;

  await db
    .prepare(
      `INSERT INTO todos (id, title, detail, priority, done, due_date, sort_order, created_at, updated_at, done_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, NULL)`,
    )
    .bind(id, input.title, input.detail, input.priority, input.dueDate, sortOrder, now, now)
    .run();

  const created = await getTodo(db, id);
  if (!created) throw new Error('待办创建后读取失败');
  return created;
}

export async function updateTodo(
  db: D1Database,
  id: string,
  patch: {
    title?: string;
    detail?: string;
    priority?: string;
    done?: boolean;
    dueDate?: string | null;
    sortOrder?: number;
  },
): Promise<TodoDTO> {
  const existing = await db.prepare('SELECT * FROM todos WHERE id = ?').bind(id).first<TodoRow>();
  if (!existing) throw notFound('待办不存在');

  const done = patch.done === undefined ? existing.done : patch.done ? 1 : 0;
  let doneAt = existing.done_at;
  if (patch.done !== undefined) {
    doneAt = patch.done ? existing.done_at ?? nowIso() : null;
  }

  await db
    .prepare(
      `UPDATE todos
       SET title = ?, detail = ?, priority = ?, done = ?, due_date = ?, sort_order = ?,
           updated_at = ?, done_at = ?
       WHERE id = ?`,
    )
    .bind(
      patch.title ?? existing.title,
      patch.detail ?? existing.detail,
      patch.priority ?? existing.priority,
      done,
      patch.dueDate === undefined ? existing.due_date : patch.dueDate,
      patch.sortOrder ?? existing.sort_order,
      nowIso(),
      doneAt,
      id,
    )
    .run();

  const updated = await getTodo(db, id);
  if (!updated) throw notFound('待办不存在');
  return updated;
}

export async function deleteTodo(db: D1Database, id: string): Promise<void> {
  const res = await db.prepare('DELETE FROM todos WHERE id = ?').bind(id).run();
  const changes = Number((res.meta as { changes?: number })?.changes ?? 0);
  if (changes === 0) throw notFound('待办不存在');
}

/* ── 习惯 ──────────────────────────────────────────────── */

export async function listHabits(db: D1Database): Promise<HabitDTO[]> {
  const { results } = await db
    .prepare('SELECT * FROM habits ORDER BY active DESC, sort_order ASC, created_at ASC')
    .all<HabitRow>();
  return results.map(toHabit);
}

export async function getHabit(db: D1Database, id: string): Promise<HabitDTO | null> {
  const row = await db.prepare('SELECT * FROM habits WHERE id = ?').bind(id).first<HabitRow>();
  return row ? toHabit(row) : null;
}

export async function createHabit(
  db: D1Database,
  input: { name: string; icon: string; color: string },
): Promise<HabitDTO> {
  const id = newId('habit_');
  const maxRow = await db
    .prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM habits')
    .first<{ m: number }>();

  await db
    .prepare(
      `INSERT INTO habits (id, name, icon, color, active, sort_order, created_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
    )
    .bind(id, input.name, input.icon, input.color, Number(maxRow?.m ?? 0) + 1, nowIso())
    .run();

  const created = await getHabit(db, id);
  if (!created) throw new Error('习惯创建后读取失败');
  return created;
}

export async function updateHabit(
  db: D1Database,
  id: string,
  patch: { name?: string; icon?: string; color?: string; active?: boolean; sortOrder?: number },
): Promise<HabitDTO> {
  const existing = await db.prepare('SELECT * FROM habits WHERE id = ?').bind(id).first<HabitRow>();
  if (!existing) throw notFound('习惯不存在');

  await db
    .prepare(
      'UPDATE habits SET name = ?, icon = ?, color = ?, active = ?, sort_order = ? WHERE id = ?',
    )
    .bind(
      patch.name ?? existing.name,
      patch.icon ?? existing.icon,
      patch.color ?? existing.color,
      patch.active === undefined ? existing.active : patch.active ? 1 : 0,
      patch.sortOrder ?? existing.sort_order,
      id,
    )
    .run();

  const updated = await getHabit(db, id);
  if (!updated) throw notFound('习惯不存在');
  return updated;
}

/** 删除习惯时会连带删掉它的打卡记录（外键 ON DELETE CASCADE） */
export async function deleteHabit(db: D1Database, id: string): Promise<void> {
  const res = await db.prepare('DELETE FROM habits WHERE id = ?').bind(id).run();
  const changes = Number((res.meta as { changes?: number })?.changes ?? 0);
  if (changes === 0) throw notFound('习惯不存在');
}

export async function listHabitLogs(
  db: D1Database,
  opts: { from?: string; to?: string } = {},
): Promise<HabitLogDTO[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.from) {
    where.push('day >= ?');
    params.push(opts.from);
  }
  if (opts.to) {
    where.push('day <= ?');
    params.push(opts.to);
  }
  const sql = `SELECT * FROM habit_logs
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY day ASC`;
  const { results } = await db.prepare(sql).bind(...params).all<HabitLogRow>();
  return results.map((r) => ({
    habitId: r.habit_id,
    day: r.day,
    count: r.count,
    note: r.note,
  }));
}

/** 打卡 / 取消打卡。checked 为 undefined 时表示「切换」 */
export async function setHabitLog(
  db: D1Database,
  habitId: string,
  day: string,
  checked?: boolean,
): Promise<{ habitId: string; day: string; checked: boolean }> {
  const habit = await getHabit(db, habitId);
  if (!habit) throw notFound('习惯不存在');

  const existing = await db
    .prepare('SELECT count FROM habit_logs WHERE habit_id = ? AND day = ?')
    .bind(habitId, day)
    .first<{ count: number }>();

  const shouldCheck = checked === undefined ? !existing : checked;

  if (shouldCheck) {
    await db
      .prepare(
        `INSERT INTO habit_logs (habit_id, day, count, note, updated_at)
         VALUES (?, ?, 1, '', ?)
         ON CONFLICT(habit_id, day) DO UPDATE SET count = habit_logs.count + 1, updated_at = excluded.updated_at`,
      )
      .bind(habitId, day, nowIso())
      .run();
  } else if (existing) {
    await db
      .prepare('DELETE FROM habit_logs WHERE habit_id = ? AND day = ?')
      .bind(habitId, day)
      .run();
  }

  return { habitId, day, checked: shouldCheck };
}

/**
 * 计算连续打卡天数。
 * today 必须由前端传「本地日期」，否则跨时区会算错。
 * 规则：今天打了卡就从今天往回数；今天没打但昨天打了，就从昨天往回数。
 */
export function computeStreak(days: Set<string>, today: string): number {
  const cursor = new Date(today + 'T00:00:00Z');
  if (!days.has(today)) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  let streak = 0;
  for (let i = 0; i < 3650; i++) {
    const key = cursor.toISOString().slice(0, 10);
    if (!days.has(key)) break;
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

/* ── 文档 ──────────────────────────────────────────────── */

export async function listDocuments(db: D1Database): Promise<DocumentDTO[]> {
  const { results } = await db
    .prepare('SELECT * FROM documents ORDER BY created_at DESC')
    .all<DocumentRow>();
  return results.map(toDocument);
}

export async function getDocument(db: D1Database, id: string): Promise<DocumentDTO | null> {
  const row = await db.prepare('SELECT * FROM documents WHERE id = ?').bind(id).first<DocumentRow>();
  return row ? toDocument(row) : null;
}

export async function getDocumentRow(db: D1Database, id: string): Promise<DocumentRow | null> {
  return (await db.prepare('SELECT * FROM documents WHERE id = ?').bind(id).first<DocumentRow>()) ?? null;
}

export async function createDocument(
  db: D1Database,
  input: { name: string; sizeBytes: number; contentType: string; r2Key: string },
): Promise<DocumentDTO> {
  const id = newId('doc_');
  await db
    .prepare(
      `INSERT INTO documents (id, name, size_bytes, content_type, r2_key, created_at, last_page, total_pages, opened_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, NULL, NULL)`,
    )
    .bind(id, input.name, input.sizeBytes, input.contentType, input.r2Key, nowIso())
    .run();
  const created = await getDocument(db, id);
  if (!created) throw new Error('文档创建后读取失败');
  return created;
}

export async function updateDocument(
  db: D1Database,
  id: string,
  patch: { name?: string; lastPage?: number; totalPages?: number | null; opened?: boolean },
): Promise<DocumentDTO> {
  const existing = await db.prepare('SELECT * FROM documents WHERE id = ?').bind(id).first<DocumentRow>();
  if (!existing) throw notFound('文档不存在');

  await db
    .prepare(
      `UPDATE documents SET name = ?, last_page = ?, total_pages = ?, opened_at = ? WHERE id = ?`,
    )
    .bind(
      patch.name ?? existing.name,
      patch.lastPage ?? existing.last_page,
      patch.totalPages === undefined ? existing.total_pages : patch.totalPages,
      patch.opened ? nowIso() : existing.opened_at,
      id,
    )
    .run();

  const updated = await getDocument(db, id);
  if (!updated) throw notFound('文档不存在');
  return updated;
}

export async function deleteDocument(db: D1Database, id: string): Promise<string> {
  const row = await db.prepare('SELECT r2_key FROM documents WHERE id = ?').bind(id).first<{ r2_key: string }>();
  if (!row) throw notFound('文档不存在');
  await db.prepare('DELETE FROM documents WHERE id = ?').bind(id).run();
  return row.r2_key;
}

/** 已用容量（字节） */
export async function storageUsed(db: D1Database): Promise<number> {
  const row = await db
    .prepare('SELECT COALESCE(SUM(size_bytes), 0) AS total FROM documents')
    .first<{ total: number }>();
  return Number(row?.total ?? 0);
}

/* ── 聚合查询（首页与习惯页共用）────────────────────────── */

export interface EnrichedHabit extends HabitDTO {
  streak: number;
  checkedToday: boolean;
  totalDays: number;
}

/** 把 YYYY-MM-DD 往前/往后推 n 天 */
export function shiftDay(day: string, deltaDays: number): string {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

/**
 * 习惯列表 + 连续天数 + 打卡记录。
 * today 必须是调用方所在时区的「本地日期」，否则深夜打卡会被算到第二天。
 */
export async function habitsWithStreaks(
  db: D1Database,
  today: string,
  days: number,
): Promise<{ habits: EnrichedHabit[]; logs: HabitLogDTO[]; from: string }> {
  const from = shiftDay(today, -(days - 1));

  const [habits, logs] = await Promise.all([
    listHabits(db),
    listHabitLogs(db, { from, to: today }),
  ]);

  const daysByHabit = new Map<string, Set<string>>();
  for (const log of logs) {
    let set = daysByHabit.get(log.habitId);
    if (!set) {
      set = new Set<string>();
      daysByHabit.set(log.habitId, set);
    }
    set.add(log.day);
  }

  return {
    from,
    logs,
    habits: habits.map((habit) => {
      const set = daysByHabit.get(habit.id) ?? new Set<string>();
      return {
        ...habit,
        streak: computeStreak(set, today),
        checkedToday: set.has(today),
        totalDays: set.size,
      };
    }),
  };
}

/** 导出用：把所有笔记（含正文）全部读出，内部自动分批，避免一次拉爆内存 */
export async function listAllNotes(db: D1Database, pageSize = 500): Promise<NoteDTO[]> {
  const out: NoteDTO[] = [];
  for (let offset = 0; offset < 200_000; offset += pageSize) {
    const batch = await listNotes(db, { limit: pageSize, offset });
    out.push(...batch);
    if (batch.length < pageSize) break;
  }
  return out;
}
