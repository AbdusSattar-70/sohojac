-- Additive attendance edit version with unique enrollment/date from foundation.
ALTER TABLE academy_attendance ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1);
CREATE INDEX IF NOT EXISTS idx_attendance_class_date ON academy_attendance(class_on,state);
