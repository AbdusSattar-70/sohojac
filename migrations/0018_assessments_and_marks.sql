-- Assessments belong to a single batch. Marks belong to a verified enrollment.
CREATE TABLE IF NOT EXISTS academy_assessments (
  id TEXT PRIMARY KEY NOT NULL,
  batch_id TEXT NOT NULL REFERENCES academy_batches(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 2 AND 160),
  subject TEXT NOT NULL CHECK(length(subject) BETWEEN 2 AND 120),
  held_on TEXT NOT NULL,
  max_marks INTEGER NOT NULL CHECK(max_marks BETWEEN 1 AND 1000),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED')),
  created_by TEXT NOT NULL REFERENCES "user"(id),
  published_by TEXT REFERENCES "user"(id),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  published_at TEXT,
  UNIQUE(batch_id,title,held_on)
);
CREATE INDEX IF NOT EXISTS idx_academy_assessments_batch ON academy_assessments(batch_id,held_on DESC);

CREATE TABLE IF NOT EXISTS academy_assessment_results (
  id TEXT PRIMARY KEY NOT NULL,
  assessment_id TEXT NOT NULL REFERENCES academy_assessments(id) ON DELETE RESTRICT,
  enrollment_id TEXT NOT NULL REFERENCES academy_enrollments(id) ON DELETE RESTRICT,
  obtained_marks INTEGER NOT NULL CHECK(obtained_marks>=0),
  note TEXT CHECK(note IS NULL OR length(note)<=500),
  graded_by TEXT NOT NULL REFERENCES "user"(id),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
  graded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(assessment_id,enrollment_id)
);
CREATE INDEX IF NOT EXISTS idx_result_enrollment ON academy_assessment_results(enrollment_id);

-- Reject grades outside the exam maximum or for another batch;
-- never edit marks of published exams.
CREATE TRIGGER IF NOT EXISTS guard_assessment_grade_insert
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
CREATE TRIGGER IF NOT EXISTS guard_assessment_grade_update
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
