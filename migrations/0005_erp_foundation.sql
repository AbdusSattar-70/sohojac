-- Sohoj Academy ERP foundation. One D1 database, no Supabase dependencies.
-- Additive only. Tables are deliberately empty: production student, fee, and
-- staff records MUST come from explicit verified workflows, never auto-seeds.

-- Public request does not create a login. Only OWNER/ADMIN can approve it.
CREATE TABLE IF NOT EXISTS staff_access_requests (
  id TEXT PRIMARY KEY NOT NULL,
  full_name TEXT NOT NULL CHECK(length(full_name) BETWEEN 2 AND 160),
  email TEXT NOT NULL CHECK(length(email) BETWEEN 5 AND 254),
  mobile TEXT NOT NULL CHECK(length(mobile)=11),
  requested_role TEXT NOT NULL CHECK(requested_role IN ('ADMIN','OPERATOR','TEACHER','ACCOUNTANT')),
  assigned_role TEXT CHECK(assigned_role IN ('ADMIN','OPERATOR','TEACHER','ACCOUNTANT')),
  purpose TEXT NOT NULL CHECK(length(purpose) BETWEEN 5 AND 500),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','VERIFIED','DECLINED','INVITED','ACTIVE')),
  review_note TEXT,
  reviewed_by TEXT REFERENCES "user"(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_staff_access_requests_status ON staff_access_requests(status,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_access_requests_pending_email
  ON staff_access_requests(lower(email)) WHERE status IN ('PENDING','VERIFIED','INVITED');

CREATE TABLE IF NOT EXISTS staff_invitation_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL REFERENCES staff_access_requests(id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_by TEXT NOT NULL REFERENCES "user"(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_staff_invites_request ON staff_invitation_tokens(request_id,created_at DESC);

CREATE TABLE IF NOT EXISTS erp_audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES "user"(id),
  reason TEXT NOT NULL DEFAULT '',
  before_json TEXT CHECK(before_json IS NULL OR json_valid(before_json)),
  after_json TEXT CHECK(after_json IS NULL OR json_valid(after_json)),
  occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_erp_audit_entity ON erp_audit_events(entity_type,entity_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_erp_audit_actor ON erp_audit_events(actor_id,occurred_at DESC);

CREATE TABLE IF NOT EXISTS academic_years (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  starts_on TEXT,
  ends_on TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ACTIVE','CLOSED')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_academic_year ON academic_years(status) WHERE status='ACTIVE';

CREATE TABLE IF NOT EXISTS academic_subjects (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  class_grade INTEGER CHECK(class_grade BETWEEN 1 AND 12),
  group_name TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);

CREATE TABLE IF NOT EXISTS academy_programmes (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);

CREATE TABLE IF NOT EXISTS academy_batches (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  offering_id TEXT NOT NULL REFERENCES public_programme_offerings(id) ON DELETE RESTRICT,
  year_id TEXT REFERENCES academic_years(id) ON DELETE RESTRICT,
  capacity INTEGER NOT NULL CHECK(capacity BETWEEN 1 AND 100),
  begins_on TEXT,
  ends_on TEXT,
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK(status IN ('PLANNED','ACTIVE','COMPLETED','CANCELLED')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_batches_offering ON academy_batches(offering_id,status);

CREATE TABLE IF NOT EXISTS academy_students (
  id TEXT PRIMARY KEY NOT NULL,
  student_no TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  class_grade INTEGER CHECK(class_grade BETWEEN 1 AND 12),
  guardian_name TEXT NOT NULL,
  guardian_mobile TEXT NOT NULL,
  school_name TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE','GRADUATED')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Admission lifecycle: draft -> review -> accepted -> billed -> enrolled.
-- An enquiry or even an accepted application does not itself create a student.
CREATE TABLE IF NOT EXISTS academy_admissions (
  id TEXT PRIMARY KEY NOT NULL,
  application_no TEXT NOT NULL UNIQUE,
  enquiry_id TEXT UNIQUE REFERENCES public_enquiries(id) ON DELETE RESTRICT,
  offering_id TEXT NOT NULL REFERENCES public_programme_offerings(id) ON DELETE RESTRICT,
  student_id TEXT UNIQUE REFERENCES academy_students(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK(status IN ('DRAFT','REVIEW','ACCEPTED','BILLED','ENROLLED','REJECTED','CANCELLED')),
  review_note TEXT,
  prepared_by TEXT NOT NULL REFERENCES "user"(id),
  verified_by TEXT REFERENCES "user"(id),
  approved_by TEXT REFERENCES "user"(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_admissions_status ON academy_admissions(status,created_at DESC);

CREATE TABLE IF NOT EXISTS academy_enrollments (
  id TEXT PRIMARY KEY NOT NULL,
  student_id TEXT NOT NULL REFERENCES academy_students(id) ON DELETE RESTRICT,
  batch_id TEXT NOT NULL REFERENCES academy_batches(id) ON DELETE RESTRICT,
  admission_id TEXT NOT NULL UNIQUE REFERENCES academy_admissions(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','TRANSFERRED','WITHDRAWN','COMPLETED')),
  enrolled_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(student_id,batch_id)
);

CREATE TABLE IF NOT EXISTS academy_fee_plans (
  id TEXT PRIMARY KEY NOT NULL,
  offering_id TEXT NOT NULL REFERENCES public_programme_offerings(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  monthly_amount_paisa INTEGER NOT NULL CHECK(monthly_amount_paisa>=0),
  admission_amount_paisa INTEGER NOT NULL DEFAULT 0 CHECK(admission_amount_paisa>=0),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);

CREATE TABLE IF NOT EXISTS finance_invoices (
  id TEXT PRIMARY KEY NOT NULL,
  invoice_no TEXT NOT NULL UNIQUE,
  student_id TEXT NOT NULL REFERENCES academy_students(id) ON DELETE RESTRICT,
  admission_id TEXT REFERENCES academy_admissions(id) ON DELETE RESTRICT,
  issue_on TEXT NOT NULL,
  due_on TEXT,
  amount_paisa INTEGER NOT NULL CHECK(amount_paisa>=0),
  paid_paisa INTEGER NOT NULL DEFAULT 0 CHECK(paid_paisa BETWEEN 0 AND amount_paisa),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ISSUED','PARTIAL','PAID','VOID')),
  created_by TEXT NOT NULL REFERENCES "user"(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_invoices_student ON finance_invoices(student_id,status);

CREATE TABLE IF NOT EXISTS finance_payments (
  id TEXT PRIMARY KEY NOT NULL,
  receipt_no TEXT NOT NULL UNIQUE,
  student_id TEXT NOT NULL REFERENCES academy_students(id) ON DELETE RESTRICT,
  amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0),
  payment_method TEXT NOT NULL CHECK(payment_method IN ('CASH','BANK','MFS')),
  received_by TEXT NOT NULL REFERENCES "user"(id),
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reference TEXT
);
CREATE TABLE IF NOT EXISTS finance_allocations (
  id TEXT PRIMARY KEY NOT NULL,
  payment_id TEXT NOT NULL REFERENCES finance_payments(id) ON DELETE RESTRICT,
  invoice_id TEXT NOT NULL REFERENCES finance_invoices(id) ON DELETE RESTRICT,
  amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0),
  UNIQUE(payment_id,invoice_id)
);
CREATE TABLE IF NOT EXISTS finance_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);
CREATE TABLE IF NOT EXISTS finance_journals (
  id TEXT PRIMARY KEY NOT NULL,
  reference TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  posted_by TEXT NOT NULL REFERENCES "user"(id),
  posted_at TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','POSTED','REVERSED')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS finance_journal_lines (
  id TEXT PRIMARY KEY NOT NULL,
  journal_id TEXT NOT NULL REFERENCES finance_journals(id) ON DELETE RESTRICT,
  account_id TEXT NOT NULL REFERENCES finance_accounts(id) ON DELETE RESTRICT,
  debit_paisa INTEGER NOT NULL DEFAULT 0 CHECK(debit_paisa>=0),
  credit_paisa INTEGER NOT NULL DEFAULT 0 CHECK(credit_paisa>=0),
  CHECK((debit_paisa>0 AND credit_paisa=0) OR (credit_paisa>0 AND debit_paisa=0))
);
CREATE INDEX IF NOT EXISTS idx_journal_lines_journal ON finance_journal_lines(journal_id);

CREATE TABLE IF NOT EXISTS academy_attendance (
  id TEXT PRIMARY KEY NOT NULL,
  enrollment_id TEXT NOT NULL REFERENCES academy_enrollments(id) ON DELETE RESTRICT,
  class_on TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('PRESENT','ABSENT','LATE','EXCUSED')),
  recorded_by TEXT NOT NULL REFERENCES "user"(id),
  recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(enrollment_id,class_on)
);
