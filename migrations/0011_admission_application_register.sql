-- Admission applications remain separate from enrolled students and invoices.
-- No sample people, login accounts or money is created by this migration.
ALTER TABLE academy_admissions ADD COLUMN student_full_name TEXT NOT NULL DEFAULT '' CHECK(length(student_full_name)<=160);
ALTER TABLE academy_admissions ADD COLUMN class_grade INTEGER CHECK(class_grade BETWEEN 1 AND 12);
ALTER TABLE academy_admissions ADD COLUMN guardian_full_name TEXT NOT NULL DEFAULT '' CHECK(length(guardian_full_name)<=160);
ALTER TABLE academy_admissions ADD COLUMN guardian_mobile TEXT NOT NULL DEFAULT '' CHECK(length(guardian_mobile)<=11);
ALTER TABLE academy_admissions ADD COLUMN school_name TEXT CHECK(school_name IS NULL OR length(school_name)<=160);
ALTER TABLE academy_admissions ADD COLUMN batch_id TEXT REFERENCES academy_batches(id) ON DELETE RESTRICT;
ALTER TABLE academy_admissions ADD COLUMN fee_plan_id TEXT REFERENCES academy_fee_plans(id) ON DELETE RESTRICT;
ALTER TABLE academy_admissions ADD COLUMN consent_verified INTEGER NOT NULL DEFAULT 0 CHECK(consent_verified IN (0,1));
ALTER TABLE academy_admissions ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1);
CREATE INDEX IF NOT EXISTS idx_admissions_batch ON academy_admissions(batch_id,status);
