-- C5c: immutable guardian opt-out and traceable cancellation; not an SMS dispatcher.
-- Forward-only: never reset existing development or production records.
ALTER TABLE guardian_message_outbox ADD COLUMN cancelled_by TEXT REFERENCES "user"(id) ON DELETE RESTRICT;
ALTER TABLE guardian_message_outbox ADD COLUMN cancel_reason TEXT CHECK(cancel_reason IS NULL OR length(cancel_reason) BETWEEN 4 AND 240);

CREATE TABLE guardian_sms_optouts (
 student_id TEXT PRIMARY KEY NOT NULL REFERENCES academy_students(id) ON DELETE RESTRICT,
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 10 AND 240),
 recorded_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- An opt-out cannot be silently reversed via CRUD. Consent reinstatement
-- requires a separately audited policy and an approved forward migration.
CREATE TRIGGER guardian_sms_optout_no_delete
 BEFORE DELETE ON guardian_sms_optouts
 BEGIN SELECT RAISE(ABORT,'sms_optout_is_immutable'); END;
CREATE TRIGGER guardian_sms_optout_no_update
 BEFORE UPDATE ON guardian_sms_optouts
 BEGIN SELECT RAISE(ABORT,'sms_optout_is_immutable'); END;
-- Race-safe at the DB boundary: if a guardian has opted out, even a stale
-- API request cannot enqueue more messages.
CREATE TRIGGER guardian_sms_optout_blocks_queue
 BEFORE INSERT ON guardian_message_outbox
 WHEN EXISTS(SELECT 1 FROM guardian_sms_optouts WHERE student_id=NEW.student_id)
 BEGIN SELECT RAISE(ABORT,'guardian_sms_opted_out'); END;
