-- Sohojac public site baseline (the same D1 DB as future Better Auth + academy data).
-- Enquiries are prospects only: NO admission, billing, or Student ID is created.
CREATE TABLE IF NOT EXISTS public_programme_offerings (
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
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (current_open_seats <= current_total_seats)
);
CREATE INDEX IF NOT EXISTS idx_public_programmes_display
ON public_programme_offerings(show_on_website, is_active, showcase_sort_order);

CREATE TABLE IF NOT EXISTS public_enquiries (
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
CREATE INDEX IF NOT EXISTS idx_public_enquiries_recent ON public_enquiries(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_enquiries_mobile_recent ON public_enquiries(mobile, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_enquiries_offering ON public_enquiries(offering_id);
