-- C8: consent suppression belongs to the guardian CONTACT, not just a student.
-- No existing record is removed or rekeyed; the prior student-level opt-outs
-- remain immutable for audit and compatibility.
CREATE TABLE guardian_sms_contact_suppressions (
 guardian_mobile TEXT PRIMARY KEY NOT NULL,
 source_student_id TEXT NOT NULL REFERENCES academy_students(id) ON DELETE RESTRICT,
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 10 AND 240),
 recorded_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- Carry prior refusals forward. Never lose a refusal because two students share
-- a guardian contact. Preserve the original staff actor and reason.
INSERT OR IGNORE INTO guardian_sms_contact_suppressions(guardian_mobile,source_student_id,reason,recorded_by,recorded_at)
 SELECT s.guardian_mobile,o.student_id,o.reason,o.recorded_by,o.recorded_at
 FROM guardian_sms_optouts o JOIN academy_students s ON s.id=o.student_id
 ORDER BY o.recorded_at,o.student_id;
CREATE TRIGGER guardian_sms_contact_suppression_no_delete
 BEFORE DELETE ON guardian_sms_contact_suppressions
 BEGIN SELECT RAISE(ABORT,'guardian_contact_optout_is_immutable'); END;
CREATE TRIGGER guardian_sms_contact_suppression_no_update
 BEFORE UPDATE ON guardian_sms_contact_suppressions
 BEGIN SELECT RAISE(ABORT,'guardian_contact_optout_is_immutable'); END;
-- Contact-level enforcement is in SQLite so a concurrent API request cannot
-- enqueue to a sibling of an opted-out guardian.
CREATE TRIGGER guardian_sms_contact_suppression_blocks_insert
 BEFORE INSERT ON guardian_message_outbox
 WHEN EXISTS (
   SELECT 1 FROM academy_students s
   JOIN guardian_sms_contact_suppressions g ON g.guardian_mobile=s.guardian_mobile
   WHERE s.id=NEW.student_id
 )
 BEGIN SELECT RAISE(ABORT,'guardian_sms_contact_opted_out'); END;
-- Applying an opt-out also immediately cancels every still-held request for
-- all students using that contact; cancellation audit retains an actor.
CREATE TRIGGER guardian_sms_contact_suppression_cancels_held
 AFTER INSERT ON guardian_sms_contact_suppressions
 BEGIN
   UPDATE guardian_message_outbox
   SET status='CANCELLED',
       cancelled_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
       cancelled_by=NEW.recorded_by,
       cancel_reason='Guardian contact opted out'
   WHERE status='HELD' AND student_id IN (
     SELECT id FROM academy_students WHERE guardian_mobile=NEW.guardian_mobile
   );
   INSERT OR IGNORE INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason)
   SELECT 'sms-cancel-'||id,'guardian_message',id,'CANCELLED',cancelled_by,cancel_reason
   FROM guardian_message_outbox
   WHERE status='CANCELLED' AND cancel_reason='Guardian contact opted out'
     AND cancelled_by=NEW.recorded_by AND student_id IN (
       SELECT id FROM academy_students WHERE guardian_mobile=NEW.guardian_mobile
     );
   INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason)
   VALUES(lower(hex(randomblob(16))),'guardian_sms_contact',NEW.source_student_id,
     'OPTOUT',NEW.recorded_by,NEW.reason);
 END;
-- A queued message never follows a student's guardian number change to a new,
-- unverified recipient. The old request is cancelled, not retargeted.
CREATE TRIGGER guardian_sms_contact_change_cancels_held
 AFTER UPDATE OF guardian_mobile ON academy_students
 WHEN OLD.guardian_mobile<>NEW.guardian_mobile
 BEGIN
   UPDATE guardian_message_outbox SET
     status='CANCELLED',
     cancelled_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),
     cancel_reason='Guardian contact changed'
   WHERE status='HELD' AND student_id=NEW.id;
 END;
