-- Parity with feature/sohoj_final: academic years are independent master records.
-- Multiple calendar years may overlap or remain active simultaneously.
-- This removes only an incorrect uniqueness restriction; no rows are removed.
DROP INDEX IF EXISTS idx_one_active_academic_year;
CREATE INDEX IF NOT EXISTS idx_academic_year_status ON academic_years(status);
