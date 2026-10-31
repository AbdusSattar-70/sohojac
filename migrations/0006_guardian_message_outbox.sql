-- C5b: safely staged guardian messaging. No provider dispatch occurs in this migration.
-- Recipient is resolved at send time from the canonical student record, never copied
-- into this table; queued messages stay HELD until a separately reviewed dispatcher exists.
CREATE TABLE guardian_message_outbox (
 id TEXT PRIMARY KEY NOT NULL,
 request_id TEXT NOT NULL UNIQUE,
 student_id TEXT NOT NULL REFERENCES academy_students(id) ON DELETE RESTRICT,
 template_key TEXT NOT NULL CHECK(template_key IN ('ADMISSION_FOLLOWUP','GENERAL_REMINDER')),
 consent_attested INTEGER NOT NULL CHECK(consent_attested=1),
 status TEXT NOT NULL DEFAULT 'HELD' CHECK(status IN ('HELD','CANCELLED')),
 created_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 cancelled_at TEXT,
 CHECK((status='HELD' AND cancelled_at IS NULL) OR (status='CANCELLED' AND cancelled_at IS NOT NULL))
);
CREATE INDEX guardian_message_outbox_student_idx
 ON guardian_message_outbox(student_id,created_at DESC);
CREATE INDEX guardian_message_outbox_status_idx
 ON guardian_message_outbox(status,created_at DESC);
