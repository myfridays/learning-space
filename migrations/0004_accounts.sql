-- Run once, after 0001–0003. Existing content belongs to the original owner.
CREATE TABLE users (
 id TEXT PRIMARY KEY,
 username TEXT NOT NULL COLLATE NOCASE UNIQUE,
 password_hash TEXT NOT NULL DEFAULT '',
 role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin','member')),
 disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN (0,1)),
 session_version INTEGER NOT NULL DEFAULT 1,
 preferences TEXT NOT NULL DEFAULT '{}',
 created_at TEXT NOT NULL
);
INSERT INTO users (id,username,role,created_at) VALUES ('owner','owner','admin',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
ALTER TABLE notes ADD COLUMN user_id TEXT NOT NULL DEFAULT 'owner';
ALTER TABLE todos ADD COLUMN user_id TEXT NOT NULL DEFAULT 'owner';
ALTER TABLE habits ADD COLUMN user_id TEXT NOT NULL DEFAULT 'owner';
ALTER TABLE documents ADD COLUMN user_id TEXT NOT NULL DEFAULT 'owner';
ALTER TABLE life_entries ADD COLUMN user_id TEXT NOT NULL DEFAULT 'owner';
CREATE INDEX idx_notes_owner ON notes(user_id,pinned,updated_at);
CREATE INDEX idx_todos_owner ON todos(user_id,done,sort_order);
CREATE INDEX idx_habits_owner ON habits(user_id,active);
CREATE INDEX idx_documents_owner ON documents(user_id,created_at);
CREATE INDEX idx_life_owner ON life_entries(user_id,kind,deleted_at,day,created_at);
CREATE TABLE auth_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
