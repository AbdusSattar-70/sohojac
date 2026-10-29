-- Optimistic concurrency for academic-year setup.
-- Existing records (if any) start at version 1; never overwrite data.
ALTER TABLE academic_years ADD COLUMN version INTEGER NOT NULL DEFAULT 1
  CHECK(version >= 1);
