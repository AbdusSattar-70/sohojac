-- Prevent overbooking even when a future code path directly inserts an enrollment.
-- All student creation + enrollment + student invoice remains one D1 batch transaction.
CREATE TRIGGER IF NOT EXISTS guard_active_batch_enrollment
BEFORE INSERT ON academy_enrollments
BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM academy_batches b WHERE b.id=NEW.batch_id AND b.status='ACTIVE'
  ) THEN RAISE(ABORT,'Batch is not active') END;
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM academy_enrollments e
    WHERE e.batch_id=NEW.batch_id AND e.status='ACTIVE'
  ) >= (SELECT capacity FROM academy_batches WHERE id=NEW.batch_id)
  THEN RAISE(ABORT,'Batch capacity exceeded') END;
  SELECT CASE WHEN (
    SELECT offering_id FROM academy_batches WHERE id=NEW.batch_id
  ) != (
    SELECT offering_id FROM academy_admissions WHERE id=NEW.admission_id
  ) THEN RAISE(ABORT,'Wrong programme offering') END;
END;
