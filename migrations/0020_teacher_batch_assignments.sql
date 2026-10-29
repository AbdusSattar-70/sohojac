-- Grant only specifically assigned TEACHER accounts access to batch rosters.
CREATE TABLE IF NOT EXISTS academy_batch_teachers (
  id TEXT PRIMARY KEY NOT NULL,
  batch_id TEXT NOT NULL REFERENCES academy_batches(id) ON DELETE RESTRICT,
  teacher_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
  assigned_by TEXT NOT NULL REFERENCES "user"(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(batch_id,teacher_user_id)
);
CREATE INDEX IF NOT EXISTS idx_teacher_active_batches
ON academy_batch_teachers(teacher_user_id,active,batch_id);
