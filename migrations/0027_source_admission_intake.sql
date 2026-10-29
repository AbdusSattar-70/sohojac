-- Add source-form applicant facts without changing or deleting the already-live
-- public enquiry, admission, student or finance tables.
-- A draft contains no student identity, invoice, reserved seat, or posting.
CREATE TABLE IF NOT EXISTS academy_admission_intake_details (
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
CREATE TABLE IF NOT EXISTS academy_admission_request_keys (
 request_id TEXT PRIMARY KEY,
 admission_id TEXT NOT NULL UNIQUE REFERENCES academy_admissions(id) ON DELETE RESTRICT,
 actor_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
-- Persist a staff-intake request key against an admission, not a made-up
-- application. Historical applications have no row in either new table.
