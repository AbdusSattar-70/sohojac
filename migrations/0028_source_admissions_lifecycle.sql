-- Restore original source Admissions lifecycle controls on the existing Cloudflare D1 domain.
-- All changes additive. Never invent applicant, staff, ledger or referral rows.
CREATE TABLE IF NOT EXISTS academy_referrer_people (
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
CREATE INDEX IF NOT EXISTS idx_academy_referrers_active ON academy_referrer_people(is_active,full_name);
CREATE TABLE IF NOT EXISTS academy_admission_referrals (
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
CREATE TABLE IF NOT EXISTS academy_admission_consents (
 admission_id TEXT PRIMARY KEY REFERENCES academy_admissions(id) ON DELETE RESTRICT,
 identity_revision INTEGER NOT NULL CHECK(identity_revision>=1),
 guardian_signed_on TEXT NOT NULL CHECK(length(guardian_signed_on)=10),
 student_signed INTEGER NOT NULL DEFAULT 0 CHECK(student_signed IN (0,1)),
 physical_copy_reference TEXT,
 received_by TEXT NOT NULL REFERENCES "user"(id),
 reason TEXT NOT NULL,
 recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS academy_admission_discounts (
 admission_id TEXT PRIMARY KEY REFERENCES academy_admissions(id) ON DELETE RESTRICT,
 discount_percent INTEGER NOT NULL DEFAULT 0 CHECK(discount_percent BETWEEN 0 AND 30),
 discount_reason TEXT,
 recorded_by TEXT NOT NULL REFERENCES "user"(id),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 CHECK (discount_percent=0 OR length(COALESCE(discount_reason,''))>0)
);
CREATE TABLE IF NOT EXISTS academy_admission_extra_charges (
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
CREATE INDEX IF NOT EXISTS idx_admission_extra_charges ON academy_admission_extra_charges(admission_id,is_active);
CREATE TABLE IF NOT EXISTS academy_admission_collection_keys (
 request_id TEXT PRIMARY KEY NOT NULL,
 payment_id TEXT NOT NULL UNIQUE REFERENCES finance_payments(id) ON DELETE RESTRICT,
 admission_id TEXT NOT NULL REFERENCES academy_admissions(id) ON DELETE RESTRICT,
 actor_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT
);
