-- Formal pre-enrollment bill: immutable money snapshot; does not create a student.
-- The finance invoice is created only once enrollment is completed.
CREATE TABLE IF NOT EXISTS academy_admission_bills (
  id TEXT PRIMARY KEY NOT NULL,
  admission_id TEXT NOT NULL UNIQUE REFERENCES academy_admissions(id) ON DELETE RESTRICT,
  reference TEXT NOT NULL UNIQUE,
  monthly_amount_paisa INTEGER NOT NULL CHECK(monthly_amount_paisa>=0),
  admission_amount_paisa INTEGER NOT NULL CHECK(admission_amount_paisa>=0),
  amount_paisa INTEGER NOT NULL CHECK(amount_paisa=monthly_amount_paisa+admission_amount_paisa),
  issue_on TEXT NOT NULL,
  issued_by TEXT NOT NULL REFERENCES "user"(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_admission_bills_issued ON academy_admission_bills(issue_on);
