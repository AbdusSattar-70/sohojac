-- REVIEWED STRUCTURAL MIGRATION PLAN REQUIRED BEFORE PRODUCTION.
-- Restore the original student lifecycle without a parallel student/enrollment
-- ledger. SQLite cannot relax inline UNIQUE/CHECK constraints with ALTER.
-- Preserve complete pre-migration copies, rebuild the same canonical tables,
-- assert every original column/row and every FK, then restore normal deferred
-- checking. foreign_keys is NEVER disabled. No person or history is inferred.
-- Keep the three immutable *_pre_0029 copies for operational rollback review.
PRAGMA defer_foreign_keys=ON;
-- Dependent assessment guards are restored verbatim below.
DROP TRIGGER guard_assessment_grade_insert;
DROP TRIGGER guard_assessment_grade_update;

CREATE TABLE academy_students_pre_0029 AS SELECT * FROM academy_students;
CREATE TABLE academy_admissions_pre_0029 AS SELECT * FROM academy_admissions;
CREATE TABLE academy_enrollments_pre_0029 AS SELECT * FROM academy_enrollments;

CREATE TABLE academy_students_v0029 (
 id TEXT PRIMARY KEY NOT NULL,
 student_no TEXT NOT NULL UNIQUE,
 full_name TEXT NOT NULL,
 class_grade INTEGER CHECK(class_grade BETWEEN 1 AND 12),
 guardian_name TEXT NOT NULL,
 guardian_mobile TEXT NOT NULL,
 school_name TEXT,
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE','GRADUATED','ARCHIVED')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 merged_into_id TEXT REFERENCES academy_students(id) ON DELETE RESTRICT,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
 CHECK(merged_into_id IS NULL OR merged_into_id<>id)
);
INSERT INTO academy_students_v0029(id,student_no,full_name,class_grade,guardian_name,guardian_mobile,school_name,status,created_at)
 SELECT id,student_no,full_name,class_grade,guardian_name,guardian_mobile,school_name,status,created_at FROM academy_students;
DROP TABLE academy_students;
ALTER TABLE academy_students_v0029 RENAME TO academy_students;
CREATE INDEX idx_students_canonical ON academy_students(merged_into_id);

CREATE TABLE academy_enrollments_v0029 (
 id TEXT PRIMARY KEY NOT NULL,
 student_id TEXT NOT NULL REFERENCES academy_students(id) ON DELETE RESTRICT,
 batch_id TEXT NOT NULL REFERENCES academy_batches(id) ON DELETE RESTRICT,
 admission_id TEXT NOT NULL REFERENCES academy_admissions(id) ON DELETE RESTRICT,
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','TRANSFERRED','WITHDRAWN','COMPLETED')),
 enrolled_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ended_on TEXT CHECK(ended_on IS NULL OR length(ended_on)=10),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1)
);
INSERT INTO academy_enrollments_v0029(id,student_id,batch_id,admission_id,status,enrolled_at)
 SELECT id,student_id,batch_id,admission_id,status,enrolled_at FROM academy_enrollments;
DROP TABLE academy_enrollments;
ALTER TABLE academy_enrollments_v0029 RENAME TO academy_enrollments;
CREATE UNIQUE INDEX idx_one_active_admission_enrollment ON academy_enrollments(admission_id) WHERE status='ACTIVE';
CREATE UNIQUE INDEX idx_one_active_student_batch ON academy_enrollments(student_id,batch_id) WHERE status='ACTIVE';
CREATE INDEX idx_enrollment_student_history ON academy_enrollments(student_id,enrolled_at DESC);
CREATE INDEX idx_enrollment_batch_status ON academy_enrollments(batch_id,status);

CREATE TABLE academy_admissions_v0029 (
 id TEXT PRIMARY KEY NOT NULL,
 application_no TEXT NOT NULL UNIQUE,
 enquiry_id TEXT UNIQUE REFERENCES public_enquiries(id) ON DELETE RESTRICT,
 offering_id TEXT NOT NULL REFERENCES public_programme_offerings(id) ON DELETE RESTRICT,
 student_id TEXT REFERENCES academy_students(id) ON DELETE RESTRICT,
 status TEXT NOT NULL DEFAULT 'DRAFT'
  CHECK(status IN ('DRAFT','REVIEW','ACCEPTED','BILLED','ENROLLED','REJECTED','CANCELLED','CLOSED_ENROLLMENT')),
 review_note TEXT,
 prepared_by TEXT NOT NULL REFERENCES "user"(id),
 verified_by TEXT REFERENCES "user"(id),
 approved_by TEXT REFERENCES "user"(id),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 student_full_name TEXT NOT NULL DEFAULT '' CHECK(length(student_full_name)<=160),
 class_grade INTEGER CHECK(class_grade BETWEEN 1 AND 12),
 guardian_full_name TEXT NOT NULL DEFAULT '' CHECK(length(guardian_full_name)<=160),
 guardian_mobile TEXT NOT NULL DEFAULT '' CHECK(length(guardian_mobile)<=11),
 school_name TEXT CHECK(school_name IS NULL OR length(school_name)<=160),
 batch_id TEXT REFERENCES academy_batches(id) ON DELETE RESTRICT,
 fee_plan_id TEXT REFERENCES academy_fee_plans(id) ON DELETE RESTRICT,
 consent_verified INTEGER NOT NULL DEFAULT 0 CHECK(consent_verified IN (0,1)),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
 existing_student INTEGER NOT NULL DEFAULT 0 CHECK(existing_student IN (0,1)),
 CHECK(existing_student=0 OR student_id IS NOT NULL)
);
INSERT INTO academy_admissions_v0029(id,application_no,enquiry_id,offering_id,student_id,status,review_note,prepared_by,verified_by,approved_by,created_at,updated_at,student_full_name,class_grade,guardian_full_name,guardian_mobile,school_name,batch_id,fee_plan_id,consent_verified,version)
 SELECT id,application_no,enquiry_id,offering_id,student_id,status,review_note,prepared_by,verified_by,approved_by,created_at,updated_at,student_full_name,class_grade,guardian_full_name,guardian_mobile,school_name,batch_id,fee_plan_id,consent_verified,version FROM academy_admissions;
DROP TABLE academy_admissions;
ALTER TABLE academy_admissions_v0029 RENAME TO academy_admissions;
CREATE INDEX idx_admissions_status ON academy_admissions(status,created_at DESC);
CREATE INDEX idx_admissions_batch ON academy_admissions(batch_id,status);
CREATE INDEX idx_admissions_student ON academy_admissions(student_id,status);

CREATE TABLE academy_student_command_keys (
 request_id TEXT PRIMARY KEY NOT NULL,
 actor_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 result_id TEXT NOT NULL,
 result_json TEXT NOT NULL CHECK(json_valid(result_json)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE academy_student_merges (
 id TEXT PRIMARY KEY NOT NULL,
 source_id TEXT NOT NULL UNIQUE REFERENCES academy_students(id) ON DELETE RESTRICT,
 target_id TEXT NOT NULL REFERENCES academy_students(id) ON DELETE RESTRICT,
 authorized_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 authorization_reason TEXT NOT NULL CHECK(length(trim(authorization_reason)) BETWEEN 5 AND 500),
 source_snapshot TEXT NOT NULL CHECK(json_valid(source_snapshot)),
 target_snapshot TEXT NOT NULL CHECK(json_valid(target_snapshot)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 CHECK(source_id<>target_id)
);
CREATE TABLE academy_enrollment_transfers (
 id TEXT PRIMARY KEY NOT NULL,
 student_id TEXT NOT NULL REFERENCES academy_students(id) ON DELETE RESTRICT,
 admission_id TEXT NOT NULL REFERENCES academy_admissions(id) ON DELETE RESTRICT,
 from_enrollment_id TEXT NOT NULL REFERENCES academy_enrollments(id) ON DELETE RESTRICT,
 to_enrollment_id TEXT NOT NULL UNIQUE REFERENCES academy_enrollments(id) ON DELETE RESTRICT,
 from_batch_id TEXT NOT NULL REFERENCES academy_batches(id) ON DELETE RESTRICT,
 to_batch_id TEXT NOT NULL REFERENCES academy_batches(id) ON DELETE RESTRICT,
 authorized_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 authorization_reason TEXT NOT NULL CHECK(length(trim(authorization_reason)) BETWEEN 5 AND 500),
 transferred_on TEXT NOT NULL CHECK(length(transferred_on)=10),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 CHECK(from_enrollment_id<>to_enrollment_id AND from_batch_id<>to_batch_id)
);
CREATE TABLE academy_student_enrollment_closures (
 id TEXT NOT NULL UNIQUE,
 enrollment_id TEXT PRIMARY KEY NOT NULL REFERENCES academy_enrollments(id) ON DELETE RESTRICT,
 student_id TEXT NOT NULL REFERENCES academy_students(id) ON DELETE RESTRICT,
 mode TEXT NOT NULL CHECK(mode IN ('WITHDRAWN','COMPLETED')),
 closed_on TEXT NOT NULL CHECK(length(closed_on)=10),
 actor_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 5 AND 500),
 before_json TEXT NOT NULL CHECK(json_valid(before_json)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Replaces the original trigger implicitly removed with the rebuilt table.
CREATE TRIGGER guard_active_batch_enrollment
BEFORE INSERT ON academy_enrollments WHEN NEW.status='ACTIVE'
BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM academy_batches b JOIN academy_admissions a ON a.id=NEW.admission_id
  JOIN academy_students s ON s.id=NEW.student_id
  WHERE b.id=NEW.batch_id AND b.status='ACTIVE' AND b.offering_id=a.offering_id
   AND a.student_id=NEW.student_id AND s.merged_into_id IS NULL AND s.status<>'ARCHIVED'
 ) THEN RAISE(ABORT,'Invalid canonical student or active offering-linked batch') END;
 SELECT CASE WHEN (SELECT COUNT(*) FROM academy_enrollments WHERE batch_id=NEW.batch_id AND status='ACTIVE')
  >=(SELECT capacity FROM academy_batches WHERE id=NEW.batch_id)
  THEN RAISE(ABORT,'Batch capacity exceeded') END;
 SELECT CASE WHEN EXISTS(
  SELECT 1 FROM academy_enrollments e JOIN academy_batches b ON b.id=e.batch_id
  JOIN public_programme_offerings o ON o.id=b.offering_id
  JOIN academy_batches nb ON nb.id=NEW.batch_id
  JOIN public_programme_offerings no ON no.id=nb.offering_id
  WHERE e.student_id=NEW.student_id AND e.status='ACTIVE'
   AND COALESCE(b.year_id,o.academic_year_id,'name:'||o.academic_year_name)
    =COALESCE(nb.year_id,no.academic_year_id,'name:'||no.academic_year_name)
 ) THEN RAISE(ABORT,'An active enrollment already exists in this academic year') END;
END;
CREATE TRIGGER guard_enrollment_history_placement
BEFORE UPDATE OF student_id,batch_id,admission_id,enrolled_at ON academy_enrollments
WHEN NEW.student_id<>OLD.student_id OR NEW.batch_id<>OLD.batch_id OR NEW.admission_id<>OLD.admission_id OR NEW.enrolled_at<>OLD.enrolled_at
BEGIN SELECT RAISE(ABORT,'Historical enrollment placement is immutable; create a transfer record'); END;
CREATE TRIGGER guard_closed_enrollment_history
BEFORE UPDATE OF status ON academy_enrollments WHEN OLD.status<>'ACTIVE' AND NEW.status<>OLD.status
BEGIN SELECT RAISE(ABORT,'A closed enrollment remains historical'); END;
CREATE TRIGGER guard_student_merged_state
BEFORE UPDATE ON academy_students WHEN OLD.merged_into_id IS NOT NULL
BEGIN SELECT RAISE(ABORT,'Verified duplicate identity is archived; use its canonical student'); END;
CREATE TRIGGER guard_student_archive_evidence
BEFORE UPDATE OF merged_into_id,status ON academy_students
WHEN NEW.merged_into_id IS NOT NULL OR NEW.status='ARCHIVED'
BEGIN
 SELECT CASE WHEN NEW.status<>'ARCHIVED' OR NEW.merged_into_id IS NULL OR NOT EXISTS(
  SELECT 1 FROM academy_student_merges m WHERE m.source_id=NEW.id AND m.target_id=NEW.merged_into_id
 ) OR EXISTS(SELECT 1 FROM academy_enrollments e WHERE e.student_id=NEW.id AND e.status='ACTIVE')
  THEN RAISE(ABORT,'Verified duplicate resolution is required before archiving a Student ID') END;
END;
CREATE TRIGGER guard_student_merge_history_update BEFORE UPDATE ON academy_student_merges
BEGIN SELECT RAISE(ABORT,'Verified identity merge evidence is immutable'); END;
CREATE TRIGGER guard_student_merge_history_delete BEFORE DELETE ON academy_student_merges
BEGIN SELECT RAISE(ABORT,'Verified identity merge evidence is immutable'); END;
CREATE TRIGGER guard_student_transfer_history_update BEFORE UPDATE ON academy_enrollment_transfers
BEGIN SELECT RAISE(ABORT,'Enrollment transfer evidence is immutable'); END;
CREATE TRIGGER guard_student_transfer_history_delete BEFORE DELETE ON academy_enrollment_transfers
BEGIN SELECT RAISE(ABORT,'Enrollment transfer evidence is immutable'); END;

-- Restore the existing assessment guards with their original semantics.
CREATE TRIGGER guard_assessment_grade_insert
BEFORE INSERT ON academy_assessment_results
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM academy_assessments a
    JOIN academy_enrollments e ON e.id=NEW.enrollment_id
    WHERE a.id=NEW.assessment_id AND a.batch_id=e.batch_id
      AND a.status='DRAFT' AND e.status='ACTIVE'
      AND date(e.enrolled_at)<=a.held_on AND a.held_on<=date('now')
      AND NEW.obtained_marks<=a.max_marks
  ) THEN RAISE(ABORT,'Assessment is not ready for grading') END;
END;
CREATE TRIGGER guard_assessment_grade_update
BEFORE UPDATE ON academy_assessment_results
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM academy_assessments a
    JOIN academy_enrollments e ON e.id=NEW.enrollment_id
    WHERE a.id=NEW.assessment_id AND a.batch_id=e.batch_id
      AND a.status='DRAFT' AND e.status='ACTIVE'
      AND date(e.enrolled_at)<=a.held_on AND a.held_on<=date('now')
      AND NEW.obtained_marks<=a.max_marks
  ) THEN RAISE(ABORT,'Assessment is not ready for grading') END;
END;


CREATE TABLE academy_student_lifecycle_migration_checks (
 check_name TEXT PRIMARY KEY NOT NULL,
 passed INTEGER NOT NULL CHECK(passed=1),
 checked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO academy_student_lifecycle_migration_checks(check_name,passed)
 SELECT 'student_rows_preserved',NOT EXISTS(
  SELECT id,student_no,full_name,class_grade,guardian_name,guardian_mobile,school_name,status,created_at FROM academy_students_pre_0029
  EXCEPT SELECT id,student_no,full_name,class_grade,guardian_name,guardian_mobile,school_name,status,created_at FROM academy_students
 ) AND NOT EXISTS(
  SELECT id,student_no,full_name,class_grade,guardian_name,guardian_mobile,school_name,status,created_at FROM academy_students
  EXCEPT SELECT id,student_no,full_name,class_grade,guardian_name,guardian_mobile,school_name,status,created_at FROM academy_students_pre_0029
 );
INSERT INTO academy_student_lifecycle_migration_checks(check_name,passed)
 SELECT 'admission_rows_preserved',NOT EXISTS(
  SELECT * FROM academy_admissions_pre_0029 EXCEPT
  SELECT id,application_no,enquiry_id,offering_id,student_id,status,review_note,prepared_by,verified_by,approved_by,created_at,updated_at,student_full_name,class_grade,guardian_full_name,guardian_mobile,school_name,batch_id,fee_plan_id,consent_verified,version FROM academy_admissions
 ) AND NOT EXISTS(
  SELECT id,application_no,enquiry_id,offering_id,student_id,status,review_note,prepared_by,verified_by,approved_by,created_at,updated_at,student_full_name,class_grade,guardian_full_name,guardian_mobile,school_name,batch_id,fee_plan_id,consent_verified,version FROM academy_admissions
  EXCEPT SELECT * FROM academy_admissions_pre_0029
 );
INSERT INTO academy_student_lifecycle_migration_checks(check_name,passed)
 SELECT 'enrollment_rows_preserved',NOT EXISTS(
  SELECT * FROM academy_enrollments_pre_0029 EXCEPT
  SELECT id,student_id,batch_id,admission_id,status,enrolled_at FROM academy_enrollments
 ) AND NOT EXISTS(
  SELECT id,student_id,batch_id,admission_id,status,enrolled_at FROM academy_enrollments
  EXCEPT SELECT * FROM academy_enrollments_pre_0029
 );
INSERT INTO academy_student_lifecycle_migration_checks(check_name,passed)
 SELECT 'foreign_keys_valid',CASE WHEN EXISTS(SELECT 1 FROM pragma_foreign_key_check) THEN 0 ELSE 1 END;

-- A rebuilt parent table leaves deferred DROP counters even when the restored
-- canonical FK graph is valid. Reset ONLY after the CHECK-guarded full FK and
-- exact row-preservation assertions above; normal FK enforcement stays ON.
PRAGMA defer_foreign_keys=OFF;

CREATE TRIGGER guard_students_pre_0029_update BEFORE UPDATE ON academy_students_pre_0029
BEGIN SELECT RAISE(ABORT,'Pre-migration student snapshot is immutable'); END;
CREATE TRIGGER guard_students_pre_0029_delete BEFORE DELETE ON academy_students_pre_0029
BEGIN SELECT RAISE(ABORT,'Pre-migration student snapshot is immutable'); END;
CREATE TRIGGER guard_admissions_pre_0029_update BEFORE UPDATE ON academy_admissions_pre_0029
BEGIN SELECT RAISE(ABORT,'Pre-migration admission snapshot is immutable'); END;
CREATE TRIGGER guard_admissions_pre_0029_delete BEFORE DELETE ON academy_admissions_pre_0029
BEGIN SELECT RAISE(ABORT,'Pre-migration admission snapshot is immutable'); END;
CREATE TRIGGER guard_enrollments_pre_0029_update BEFORE UPDATE ON academy_enrollments_pre_0029
BEGIN SELECT RAISE(ABORT,'Pre-migration enrollment snapshot is immutable'); END;
CREATE TRIGGER guard_enrollments_pre_0029_delete BEFORE DELETE ON academy_enrollments_pre_0029
BEGIN SELECT RAISE(ABORT,'Pre-migration enrollment snapshot is immutable'); END;
