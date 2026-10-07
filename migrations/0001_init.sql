-- ============================================================
--  学习空间 · 数据库初始化
-- ============================================================
--  执行方式：
--    本地： npx wrangler d1 execute learning-space --local  --file=./migrations/0001_init.sql
--    线上： npx wrangler d1 execute learning-space --remote --file=./migrations/0001_init.sql
--
--  说明：
--    · 全部使用 IF NOT EXISTS，可以重复执行不会报错
--    · 时间统一存 ISO 8601 的 UTC 字符串，例如 2026-10-06T03:21:00.000Z
--    · 习惯打卡的 day 字段存「本地日期」YYYY-MM-DD，由前端传上来，
--      这样就不会因为服务器时区问题把深夜打卡算到第二天
-- ============================================================


-- ── 笔记 ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notes (
  id         TEXT    PRIMARY KEY,
  title      TEXT    NOT NULL DEFAULT '',
  content    TEXT    NOT NULL DEFAULT '',      -- Markdown 正文
  tags       TEXT    NOT NULL DEFAULT '[]',    -- JSON 数组字符串
  pinned     INTEGER NOT NULL DEFAULT 0,       -- 0/1，置顶
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_pinned  ON notes (pinned DESC, updated_at DESC);


-- ── 待办 ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS todos (
  id         TEXT    PRIMARY KEY,
  title      TEXT    NOT NULL,
  detail     TEXT    NOT NULL DEFAULT '',
  priority   TEXT    NOT NULL DEFAULT 'normal',  -- low | normal | high
  done       INTEGER NOT NULL DEFAULT 0,
  due_date   TEXT,                               -- YYYY-MM-DD 或 NULL
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL,
  done_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_todos_state ON todos (done, sort_order, created_at);


-- ── 习惯 ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS habits (
  id         TEXT    PRIMARY KEY,
  name       TEXT    NOT NULL,
  icon       TEXT    NOT NULL DEFAULT '✅',
  color      TEXT    NOT NULL DEFAULT '#186b5f',
  active     INTEGER NOT NULL DEFAULT 1,        -- 0 = 归档，不再显示
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL
);


-- ── 习惯打卡记录 ────────────────────────────────────────────
-- 每一行 = 某个习惯在某一天打过卡。主键是 (habit_id, day)，
-- 所以同一天重复打卡不会产生重复行，而是由应用层更新 count。
CREATE TABLE IF NOT EXISTS habit_logs (
  habit_id   TEXT    NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  day        TEXT    NOT NULL,                  -- 本地日期 YYYY-MM-DD
  count      INTEGER NOT NULL DEFAULT 1,
  note       TEXT    NOT NULL DEFAULT '',
  updated_at TEXT    NOT NULL,
  PRIMARY KEY (habit_id, day)
);
CREATE INDEX IF NOT EXISTS idx_habit_logs_day ON habit_logs (day);


-- ── 文档（PDF 等）───────────────────────────────────────────
-- 注意：文件本体存在 R2 里，这里只存元数据。
-- size_bytes 会被累加用来做「总容量限制」。
CREATE TABLE IF NOT EXISTS documents (
  id           TEXT    PRIMARY KEY,
  name         TEXT    NOT NULL,
  size_bytes   INTEGER NOT NULL DEFAULT 0,
  content_type TEXT    NOT NULL DEFAULT 'application/octet-stream',
  r2_key       TEXT    NOT NULL,                -- R2 里的对象键
  created_at   TEXT    NOT NULL,
  last_page    INTEGER NOT NULL DEFAULT 1,      -- 阅读进度
  total_pages  INTEGER,                         -- 总页数（PDF 解析后回填）
  opened_at    TEXT                             -- 最近一次打开时间
);
CREATE INDEX IF NOT EXISTS idx_documents_created ON documents (created_at DESC);


-- ── 设置（键值对）──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('schema_version', '1');
