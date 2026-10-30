-- Canonical operator-first development baseline: final current tables.
-- Fresh schema only; NO historical ALTER/DROP/rebuild or sample business records.
CREATE TABLE public_programme_offerings (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  class_name TEXT NOT NULL DEFAULT '',
  academic_year_name TEXT NOT NULL DEFAULT '',
  branch_name TEXT NOT NULL DEFAULT '',
  group_name TEXT,
  showcase_title TEXT,
  showcase_title_bn TEXT,
  showcase_description TEXT,
  showcase_description_bn TEXT,
  showcase_eyebrow TEXT,
  showcase_eyebrow_bn TEXT,
  showcase_icon TEXT,
  public_schedule TEXT,
  public_schedule_bn TEXT,
  public_requirements TEXT,
  public_requirements_bn TEXT,
  admission_policy TEXT,
  admission_policy_bn TEXT,
  subjects_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(subjects_json)),
  fee_plan_json TEXT CHECK (fee_plan_json IS NULL OR json_valid(fee_plan_json)),
  active_batch_count INTEGER NOT NULL DEFAULT 0 CHECK (active_batch_count >= 0),
  current_total_seats INTEGER NOT NULL DEFAULT 0 CHECK (current_total_seats >= 0),
  current_open_seats INTEGER NOT NULL DEFAULT 0 CHECK (current_open_seats >= 0),
  show_on_website INTEGER NOT NULL DEFAULT 0 CHECK (show_on_website IN (0,1)),
  is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0,1)),
  is_accepting_applications INTEGER NOT NULL DEFAULT 0 CHECK (is_accepting_applications IN (0,1)),
  application_state TEXT NOT NULL DEFAULT 'CLOSED' CHECK (application_state IN ('OPEN','UPCOMING','CLOSED')),
  applications_open_on TEXT,
  applications_close_on TEXT,
  showcase_sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1), branch_id TEXT REFERENCES academy_branches(id) ON DELETE RESTRICT, academic_year_id TEXT REFERENCES academic_years(id) ON DELETE RESTRICT, class_id TEXT REFERENCES academy_classes(id) ON DELETE RESTRICT, program_id TEXT REFERENCES academy_programmes(id) ON DELETE RESTRICT, group_id TEXT REFERENCES academic_groups(id) ON DELETE RESTRICT, operation_kind TEXT CHECK(operation_kind IN ('SCHOOL','COACHING','TRAINING')), teaching_starts_on TEXT, teaching_ends_on TEXT, offering_status TEXT CHECK(offering_status IN ('DRAFT','ACTIVE','RETIRED')), allowed_discount_percentages_json TEXT
  NOT NULL DEFAULT '[]' CHECK(json_valid(allowed_discount_percentages_json)), source_updated_at TEXT,
  CHECK (current_open_seats <= current_total_seats)
);

CREATE TABLE public_enquiries (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  intent TEXT NOT NULL CHECK (intent IN ('interest', 'admission')),
  offering_id TEXT REFERENCES public_programme_offerings(id) ON DELETE SET NULL,
  student_name TEXT NOT NULL,
  student_name_bn TEXT,
  student_mobile TEXT,
  student_email TEXT,
  class_name TEXT NOT NULL,
  school_name TEXT,
  guardian_name TEXT NOT NULL,
  guardian_relationship TEXT,
  mobile TEXT NOT NULL,
  alternate_mobile TEXT,
  area TEXT,
  subjects_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(subjects_json)),
  preferred_schedule TEXT,
  preferred_days_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(preferred_days_json)),
  trial_interest INTEGER NOT NULL DEFAULT 0 CHECK(trial_interest IN (0,1)),
  referral_note TEXT,
  notes TEXT,
  consent_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NEW' CHECK(status IN ('NEW','CONTACTED','CLOSED')),
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE "user" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerified" INTEGER NOT NULL DEFAULT 0,
  "image" TEXT,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);

CREATE TABLE "session" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "expiresAt" INTEGER NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE "account" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" INTEGER,
  "refreshTokenExpiresAt" INTEGER,
  "scope" TEXT,
  "password" TEXT,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);

CREATE TABLE "verification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" INTEGER NOT NULL,
  "createdAt" INTEGER,
  "updatedAt" INTEGER
);

CREATE TABLE staff_memberships (
  user_id TEXT NOT NULL PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('OWNER','ADMIN','OPERATOR','TEACHER')),
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE staff_prospect_events (
  id TEXT PRIMARY KEY NOT NULL,
  enquiry_id TEXT NOT NULL REFERENCES public_enquiries(id) ON DELETE RESTRICT,
  actor_user_id TEXT NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
  from_status TEXT NOT NULL CHECK (from_status IN ('NEW','CONTACTED','CLOSED')),
  to_status TEXT NOT NULL CHECK (to_status IN ('NEW','CONTACTED','CLOSED')),
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
  occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE staff_owner_setup (
  id TEXT PRIMARY KEY NOT NULL CHECK (id = 'first-owner'),
  email TEXT NOT NULL CHECK (length(email) BETWEEN 5 AND 180),
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 2 AND 100),
  token TEXT NOT NULL CHECK (length(token) = 64),
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  claim_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE staff_access_requests (
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

CREATE TABLE staff_invitation_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL REFERENCES staff_access_requests(id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_by TEXT NOT NULL REFERENCES "user"(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
, claim_id TEXT);

CREATE TABLE erp_audit_events (
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

CREATE TABLE academic_years (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  starts_on TEXT,
  ends_on TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ACTIVE','CLOSED')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
, version INTEGER NOT NULL DEFAULT 1
  CHECK(version >= 1));

CREATE TABLE academic_subjects (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  class_grade INTEGER CHECK(class_grade BETWEEN 1 AND 12),
  group_name TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);

CREATE TABLE academy_programmes (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);

CREATE TABLE academy_batches (
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
, version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1));

CREATE TABLE academy_fee_plans (
  id TEXT PRIMARY KEY NOT NULL,
  offering_id TEXT NOT NULL REFERENCES public_programme_offerings(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  monthly_amount_paisa INTEGER NOT NULL CHECK(monthly_amount_paisa>=0),
  admission_amount_paisa INTEGER NOT NULL DEFAULT 0 CHECK(admission_amount_paisa>=0),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
, version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1), source_version INTEGER CHECK(source_version IS NULL OR source_version>=1), source_status TEXT CHECK(source_status IN ('DRAFT','ACTIVE','RETIRED')), billing_cycle TEXT CHECK(billing_cycle IN ('MONTHLY','TERM','ONE_TIME')), due_day INTEGER CHECK(due_day BETWEEN 1 AND 28), currency_code TEXT, effective_from TEXT, effective_to TEXT, change_reason TEXT, created_by TEXT REFERENCES "user"(id) ON DELETE RESTRICT, created_at TEXT);

CREATE TABLE finance_invoices (
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

CREATE TABLE finance_payments (
  id TEXT PRIMARY KEY NOT NULL,
  receipt_no TEXT NOT NULL UNIQUE,
  student_id TEXT NOT NULL REFERENCES academy_students(id) ON DELETE RESTRICT,
  amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0),
  payment_method TEXT NOT NULL CHECK(payment_method IN ('CASH','BANK','MFS')),
  received_by TEXT NOT NULL REFERENCES "user"(id),
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reference TEXT
);

CREATE TABLE finance_allocations (
  id TEXT PRIMARY KEY NOT NULL,
  payment_id TEXT NOT NULL REFERENCES finance_payments(id) ON DELETE RESTRICT,
  invoice_id TEXT NOT NULL REFERENCES finance_invoices(id) ON DELETE RESTRICT,
  amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0),
  UNIQUE(payment_id,invoice_id)
);

CREATE TABLE finance_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
);

CREATE TABLE finance_journals (
  id TEXT PRIMARY KEY NOT NULL,
  reference TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  posted_by TEXT NOT NULL REFERENCES "user"(id),
  posted_at TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','POSTED','REVERSED')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE finance_journal_lines (
  id TEXT PRIMARY KEY NOT NULL,
  journal_id TEXT NOT NULL REFERENCES finance_journals(id) ON DELETE RESTRICT,
  account_id TEXT NOT NULL REFERENCES finance_accounts(id) ON DELETE RESTRICT,
  debit_paisa INTEGER NOT NULL DEFAULT 0 CHECK(debit_paisa>=0),
  credit_paisa INTEGER NOT NULL DEFAULT 0 CHECK(credit_paisa>=0),
  CHECK((debit_paisa>0 AND credit_paisa=0) OR (credit_paisa>0 AND debit_paisa=0))
);

CREATE TABLE academy_attendance (
  id TEXT PRIMARY KEY NOT NULL,
  enrollment_id TEXT NOT NULL REFERENCES academy_enrollments(id) ON DELETE RESTRICT,
  class_on TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('PRESENT','ABSENT','LATE','EXCUSED')),
  recorded_by TEXT NOT NULL REFERENCES "user"(id),
  recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
  UNIQUE(enrollment_id,class_on)
);

CREATE TABLE academy_admission_bills (
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

CREATE TABLE finance_operating_expenses (
  id TEXT PRIMARY KEY NOT NULL,
  reference TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK(category IN (
    'RENT','UTILITIES','TEACHING_MATERIALS','MARKETING','MAINTENANCE','TRANSPORT','OTHER'
  )),
  payee TEXT NOT NULL CHECK(length(payee) BETWEEN 2 AND 160),
  description TEXT NOT NULL CHECK(length(description) BETWEEN 3 AND 500),
  spent_on TEXT NOT NULL,
  amount_paisa INTEGER NOT NULL CHECK(amount_paisa BETWEEN 1 AND 200000000),
  payment_method TEXT NOT NULL CHECK(payment_method IN ('CASH','BANK','MFS')),
  approved_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE academy_class_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  batch_id TEXT NOT NULL REFERENCES academy_batches(id) ON DELETE RESTRICT,
  class_on TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 2 AND 160),
  topic TEXT CHECK(topic IS NULL OR length(topic)<=500),
  teacher_id TEXT REFERENCES "user"(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED','HELD','CANCELLED')),
  created_by TEXT NOT NULL REFERENCES "user"(id),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(starts_at<ends_at),
  UNIQUE(batch_id,class_on,starts_at)
);

CREATE TABLE academy_assessments (
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

CREATE TABLE academy_assessment_results (
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

CREATE TABLE academy_subjects (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL CHECK(length(code) BETWEEN 2 AND 16),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 120),
  class_grade INTEGER NOT NULL CHECK(class_grade BETWEEN 4 AND 12),
  group_name TEXT NOT NULL CHECK(group_name IN ('GENERAL','SCIENCE','BUSINESS','HUMANITIES')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(code,class_grade,group_name)
);

CREATE TABLE academy_offering_subjects (
  offering_id TEXT NOT NULL REFERENCES public_programme_offerings(id) ON DELETE RESTRICT,
  subject_id TEXT NOT NULL REFERENCES academy_subjects(id) ON DELETE RESTRICT,
  assigned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(offering_id,subject_id)
);

CREATE TABLE academy_batch_teachers (
  id TEXT PRIMARY KEY NOT NULL,
  batch_id TEXT NOT NULL REFERENCES academy_batches(id) ON DELETE RESTRICT,
  teacher_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
  assigned_by TEXT NOT NULL REFERENCES "user"(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(batch_id,teacher_user_id)
);

CREATE TABLE erp_permission_grants (
  user_id TEXT NOT NULL REFERENCES staff_memberships(user_id) ON DELETE CASCADE,
  permission TEXT NOT NULL CHECK(length(permission) BETWEEN 3 AND 120),
  granted_by TEXT REFERENCES staff_memberships(user_id) ON DELETE SET NULL,
  granted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(user_id,permission)
);

CREATE TABLE academy_classes (
 id TEXT PRIMARY KEY NOT NULL,
 code TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL,
 sort_order INTEGER NOT NULL DEFAULT 100 CHECK(sort_order BETWEEN 0 AND 9999),
 is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE academic_groups (
 id TEXT PRIMARY KEY NOT NULL,
 code TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL,
 is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE academy_areas (
 id TEXT PRIMARY KEY NOT NULL,
 name TEXT NOT NULL UNIQUE,
 is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1))
);

CREATE TABLE academy_schools (
 id TEXT PRIMARY KEY NOT NULL,
 name TEXT NOT NULL,
 area_id TEXT REFERENCES academy_areas(id) ON DELETE RESTRICT,
 is_verified INTEGER NOT NULL DEFAULT 0 CHECK(is_verified IN (0,1)),
 is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE academy_lead_sources (
 id TEXT PRIMARY KEY NOT NULL,
 code TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL,
 is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE academy_guardian_relationships (
 id TEXT PRIMARY KEY NOT NULL,
 code TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL,
 is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE academy_staff (
  staff_seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE DEFAULT (
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))),2) || '-a' ||
    substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))
  ),
  staff_no TEXT GENERATED ALWAYS AS ('SA-STF-' || printf('%06d',staff_seq)) STORED UNIQUE,
  linked_user_id TEXT UNIQUE REFERENCES "user"(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL CHECK(length(trim(full_name)) BETWEEN 2 AND 160),
  mobile TEXT,
  alternate_mobile TEXT,
  email TEXT,
  address TEXT,
  emergency_contact_name TEXT,
  emergency_contact_mobile TEXT,
  joined_on TEXT,
  left_on TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK(status IN ('ACTIVE','ON_LEAVE','RESIGNED','TERMINATED','ARCHIVED')),
  notes TEXT,
  created_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE academy_branches (
 id TEXT PRIMARY KEY NOT NULL,
 code TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL,
 is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE academy_prospects (
 seq INTEGER PRIMARY KEY AUTOINCREMENT,
 id TEXT NOT NULL UNIQUE REFERENCES public_enquiries(id) ON DELETE RESTRICT,
 prospect_no TEXT GENERATED ALWAYS AS ('PR-' || printf('%06d',seq)) STORED UNIQUE,
 status TEXT NOT NULL DEFAULT 'NEW'
  CHECK(status IN ('NEW','CONTACTED','COUNSELLING','TRIAL_SCHEDULED','TRIAL_ATTENDED',
   'REGISTERED','CONVERTED','FUTURE_FOLLOW_UP','LOST','LEGACY_CLOSED')),
 assigned_to_staff_id TEXT REFERENCES academy_staff(id) ON DELETE SET NULL,
 next_follow_up_at TEXT,
 lost_reason TEXT,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE academy_prospect_followups (
 id TEXT PRIMARY KEY NOT NULL,
 prospect_id TEXT NOT NULL REFERENCES academy_prospects(id) ON DELETE RESTRICT,
 followup_type TEXT NOT NULL CHECK(followup_type IN
  ('CALL','WHATSAPP','IN_PERSON','COUNSELLING','TRIAL','OTHER')),
 notes TEXT NOT NULL CHECK(length(notes) BETWEEN 2 AND 1200),
 outcome TEXT CHECK(outcome IS NULL OR length(outcome)<=500),
 from_status TEXT NOT NULL,
 to_status TEXT NOT NULL,
 next_follow_up_at TEXT,
 lost_reason TEXT,
 recorded_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE academy_admission_intake_details (
 admission_id TEXT PRIMARY KEY REFERENCES academy_admissions(id) ON DELETE RESTRICT,
 request_id TEXT NOT NULL UNIQUE,
 student_name_bn TEXT,
 student_mobile TEXT,
 student_email TEXT,
 date_of_birth TEXT,
 gender TEXT,
 school_roll TEXT,
 guardian_relationship TEXT,
 alternate_mobile TEXT,
 guardian_address TEXT,
 present_landmark TEXT,
 permanent_same_as_present INTEGER NOT NULL DEFAULT 0 CHECK(permanent_same_as_present IN (0,1)),
 father_name TEXT,
 mother_name TEXT,
 birth_registration TEXT,
 permanent_address TEXT,
 emergency_contact TEXT,
 emergency_mobile TEXT,
 previous_result TEXT,
 learning_needs TEXT,
 referral_note TEXT,
 contact_consent INTEGER NOT NULL DEFAULT 0 CHECK(contact_consent IN (0,1)),
 recorded_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE academy_admission_request_keys (
 request_id TEXT PRIMARY KEY,
 admission_id TEXT NOT NULL UNIQUE REFERENCES academy_admissions(id) ON DELETE RESTRICT,
 actor_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE academy_referrer_people (
 id TEXT PRIMARY KEY NOT NULL,
 full_name TEXT NOT NULL CHECK(length(trim(full_name)) BETWEEN 2 AND 160),
 mobile TEXT,
 staff_id TEXT REFERENCES academy_staff(id) ON DELETE RESTRICT,
 relationship_note TEXT,
 contact_note TEXT,
 is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
 created_by TEXT NOT NULL REFERENCES "user"(id),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE academy_admission_referrals (
 admission_id TEXT PRIMARY KEY REFERENCES academy_admissions(id) ON DELETE RESTRICT,
 source TEXT NOT NULL CHECK(source IN ('ORGANIC','REFERRED')),
 referrer_id TEXT REFERENCES academy_referrer_people(id) ON DELETE RESTRICT,
 staff_id TEXT REFERENCES academy_staff(id) ON DELETE RESTRICT,
 recorded_by TEXT NOT NULL REFERENCES "user"(id),
 reason TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 CHECK ((source='ORGANIC' AND referrer_id IS NULL AND staff_id IS NULL)
    OR (source='REFERRED' AND (referrer_id IS NOT NULL OR staff_id IS NOT NULL)))
);

CREATE TABLE academy_admission_consents (
 admission_id TEXT PRIMARY KEY REFERENCES academy_admissions(id) ON DELETE RESTRICT,
 identity_revision INTEGER NOT NULL CHECK(identity_revision>=1),
 guardian_signed_on TEXT NOT NULL CHECK(length(guardian_signed_on)=10),
 student_signed INTEGER NOT NULL DEFAULT 0 CHECK(student_signed IN (0,1)),
 physical_copy_reference TEXT,
 received_by TEXT NOT NULL REFERENCES "user"(id),
 reason TEXT NOT NULL,
 recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE academy_admission_discounts (
 admission_id TEXT PRIMARY KEY REFERENCES academy_admissions(id) ON DELETE RESTRICT,
 discount_percent INTEGER NOT NULL DEFAULT 0 CHECK(discount_percent BETWEEN 0 AND 30),
 discount_reason TEXT,
 recorded_by TEXT NOT NULL REFERENCES "user"(id),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 CHECK (discount_percent=0 OR length(COALESCE(discount_reason,''))>0)
);

CREATE TABLE academy_admission_extra_charges (
 id TEXT PRIMARY KEY NOT NULL,
 request_id TEXT NOT NULL UNIQUE,
 admission_id TEXT NOT NULL REFERENCES academy_admissions(id) ON DELETE RESTRICT,
 charge_type TEXT NOT NULL CHECK(charge_type IN ('ADMISSION','EXAM','MATERIAL','OTHER')),
 name TEXT NOT NULL,
 amount_paisa INTEGER NOT NULL CHECK(amount_paisa>0),
 is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
 recorded_by TEXT NOT NULL REFERENCES "user"(id),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE academy_admission_collection_keys (
 request_id TEXT PRIMARY KEY NOT NULL,
 payment_id TEXT NOT NULL UNIQUE REFERENCES finance_payments(id) ON DELETE RESTRICT,
 admission_id TEXT NOT NULL REFERENCES academy_admissions(id) ON DELETE RESTRICT,
 actor_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT
);

CREATE TABLE academy_student_number_sequence (
 seq INTEGER PRIMARY KEY AUTOINCREMENT,
 admission_id TEXT NOT NULL UNIQUE
);

CREATE TABLE "academy_students" (
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

CREATE TABLE "academy_enrollments" (
 id TEXT PRIMARY KEY NOT NULL,
 student_id TEXT NOT NULL REFERENCES academy_students(id) ON DELETE RESTRICT,
 batch_id TEXT NOT NULL REFERENCES academy_batches(id) ON DELETE RESTRICT,
 admission_id TEXT NOT NULL REFERENCES academy_admissions(id) ON DELETE RESTRICT,
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','TRANSFERRED','WITHDRAWN','COMPLETED')),
 enrolled_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ended_on TEXT CHECK(ended_on IS NULL OR length(ended_on)=10),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1)
);

CREATE TABLE "academy_admissions" (
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
 from_enrollment_id TEXT NOT NULL UNIQUE REFERENCES academy_enrollments(id) ON DELETE RESTRICT,
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

CREATE TABLE academy_student_lifecycle_migration_checks (
 check_name TEXT PRIMARY KEY NOT NULL,
 passed INTEGER NOT NULL CHECK(passed=1),
 checked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE academy_fee_plan_components (
 id TEXT PRIMARY KEY NOT NULL,
 plan_id TEXT NOT NULL REFERENCES academy_fee_plans(id) ON DELETE RESTRICT,
 code TEXT NOT NULL,
 name TEXT NOT NULL,
 amount_paisa INTEGER NOT NULL CHECK(amount_paisa>=0),
 charge_type TEXT NOT NULL CHECK(charge_type IN ('TUITION','ADMISSION','EXAM','MATERIAL','OTHER')),
 recurrence TEXT NOT NULL CHECK(recurrence IN ('PER_CYCLE','ONE_TIME')),
 sort_order INTEGER NOT NULL CHECK(sort_order BETWEEN 0 AND 29),
 UNIQUE(plan_id,code)
);

CREATE TABLE academy_offering_command_keys (
 request_id TEXT PRIMARY KEY NOT NULL,
 actor_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 command TEXT NOT NULL,
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 entity_id TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE finance_collection_promises (
 id TEXT PRIMARY KEY NOT NULL,
 invoice_id TEXT NOT NULL REFERENCES finance_invoices(id) ON DELETE RESTRICT,
 amount_paisa INTEGER NOT NULL CHECK(typeof(amount_paisa)='integer' AND amount_paisa>0),
 due_on TEXT NOT NULL CHECK(length(due_on)=10 AND date(due_on) IS NOT NULL AND date(due_on)=due_on),
 baseline_paid_paisa INTEGER NOT NULL CHECK(typeof(baseline_paid_paisa)='integer' AND baseline_paid_paisa>=0),
 status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','COMPLETED','CANCELLED')),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 5 AND 1000),
 actor_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE finance_collection_events (
 id TEXT PRIMARY KEY NOT NULL,
 invoice_id TEXT NOT NULL REFERENCES finance_invoices(id) ON DELETE RESTRICT,
 promise_id TEXT REFERENCES finance_collection_promises(id) ON DELETE RESTRICT,
 action TEXT NOT NULL CHECK(action IN ('PROMISE','COMPLETE','CANCEL','CONTACT')),
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 5 AND 1000),
 actor_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE finance_collection_command_keys (
 request_id TEXT PRIMARY KEY NOT NULL,
 invoice_id TEXT NOT NULL REFERENCES finance_invoices(id) ON DELETE RESTRICT,
 actor_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 result_json TEXT NOT NULL CHECK(json_valid(result_json)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE academy_identity (
 id TEXT PRIMARY KEY CHECK(id='academy'),
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 160),
 confirmed_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 confirmed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE security_request_limits (
 key TEXT PRIMARY KEY NOT NULL,
 hits INTEGER NOT NULL CHECK(hits>0),
 expires_at INTEGER NOT NULL
);

CREATE TABLE system_maintenance_operations (id TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('PREPARED','COMPLETE')), manifest_json TEXT NOT NULL, completed_at TEXT);

CREATE TABLE finance_payment_commands (
 request_id TEXT PRIMARY KEY NOT NULL,
 actor_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64),
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 payment_id TEXT NOT NULL UNIQUE REFERENCES finance_payments(id) ON DELETE RESTRICT,
 allocation_id TEXT NOT NULL UNIQUE REFERENCES finance_allocations(id) ON DELETE RESTRICT,
 audit_id TEXT NOT NULL UNIQUE REFERENCES erp_audit_events(id) ON DELETE RESTRICT,
 invoice_id TEXT NOT NULL REFERENCES finance_invoices(id) ON DELETE RESTRICT,
 admission_id TEXT REFERENCES academy_admissions(id) ON DELETE RESTRICT,
 receipt_no TEXT NOT NULL UNIQUE,
 amount_paisa INTEGER NOT NULL CHECK(amount_paisa BETWEEN 1 AND 200000000),
 payment_method TEXT NOT NULL CHECK(payment_method IN ('CASH','BANK','MFS')),
 reference TEXT,
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 5 AND 500),
 remaining_due_paisa INTEGER NOT NULL CHECK(remaining_due_paisa>=0),
 received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE finance_expense_command_keys (
  request_id TEXT PRIMARY KEY NOT NULL CHECK(length(request_id)=36),
  actor_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  expense_id TEXT NOT NULL UNIQUE,
  reference TEXT NOT NULL UNIQUE,
  audit_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
