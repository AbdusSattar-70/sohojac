-- Dated coaching sessions. Teacher assignment is separately authorized.
CREATE TABLE IF NOT EXISTS academy_class_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  batch_id TEXT NOT NULL REFERENCES academy_batches(id) ON DELETE RESTRICT,
  class_on TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 2 AND 160),
  topic TEXT CHECK(topic IS NULL OR length(topic)<=500),
  teacher_id TEXT REFERENCES "user"(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED','HELD','CANCELLED')),
  created_by TEXT NOT NULL REFERENCES "user"(id),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(starts_at<ends_at),
  UNIQUE(batch_id,class_on,starts_at)
);
CREATE INDEX IF NOT EXISTS idx_academy_sessions_batch_day
ON academy_class_sessions(batch_id,class_on DESC);

CREATE TRIGGER IF NOT EXISTS guard_session_overlap
BEFORE INSERT ON academy_class_sessions
WHEN NEW.status!='CANCELLED'
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM academy_class_sessions existing
    WHERE existing.batch_id=NEW.batch_id
      AND existing.class_on=NEW.class_on
      AND existing.status!='CANCELLED'
      AND NEW.starts_at<existing.ends_at
      AND NEW.ends_at>existing.starts_at
  ) THEN RAISE(ABORT,'Overlapping session in the same batch') END;
END;
