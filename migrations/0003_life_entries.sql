-- Additive migration: existing notes, tasks, habits and documents remain unchanged.
CREATE TABLE IF NOT EXISTS life_entries (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('mindfulness','fitness')),
  content TEXT NOT NULL,
  day TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_life_entries_timeline ON life_entries(kind, deleted_at, day DESC, created_at DESC);
