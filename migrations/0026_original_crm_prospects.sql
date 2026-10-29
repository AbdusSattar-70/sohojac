-- Additive original Student Bank/CRM storage alongside the public enquiry intake.
-- Do not relabel historical CLOSED public enquiries as LOST/CONVERTED.
-- Separate source-compatible prospect_no sequence from public reference.
CREATE TABLE IF NOT EXISTS academy_prospects (
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
CREATE INDEX IF NOT EXISTS idx_academy_prospects_queue
 ON academy_prospects(status,next_follow_up_at);
CREATE INDEX IF NOT EXISTS idx_academy_prospects_staff
 ON academy_prospects(assigned_to_staff_id,status);
CREATE TABLE IF NOT EXISTS academy_prospect_followups (
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
CREATE INDEX IF NOT EXISTS idx_prospect_followups_history
 ON academy_prospect_followups(prospect_id,occurred_at DESC,id DESC);
-- Keep already-collected public records, including legacy closed ones.
-- LEGACY_CLOSED is deliberately NOT one of the source statuses: staff must
-- review this old coarse status before it is classified into a source state.
INSERT INTO academy_prospects(id,status,created_at)
SELECT e.id,
 CASE WHEN e.status='CLOSED' THEN 'LEGACY_CLOSED'
  WHEN e.status='CONTACTED' THEN 'CONTACTED' ELSE 'NEW' END,
 e.submitted_at
FROM public_enquiries e
WHERE NOT EXISTS (SELECT 1 FROM academy_prospects p WHERE p.id=e.id)
ORDER BY e.submitted_at,e.id;
-- Future website submissions enter the canonical Student Bank automatically.
CREATE TRIGGER IF NOT EXISTS tr_new_public_enquiry_prospect
AFTER INSERT ON public_enquiries
BEGIN
 INSERT INTO academy_prospects(id,status,created_at)
 VALUES (NEW.id,
  CASE NEW.status WHEN 'CLOSED' THEN 'LEGACY_CLOSED'
   WHEN 'CONTACTED' THEN 'CONTACTED' ELSE 'NEW' END,
  NEW.submitted_at);
END;

-- Compatibility for the temporarily retained legacy /app prospect editor.
-- Preserve the richer source workflow once any advanced status is set.
CREATE TRIGGER IF NOT EXISTS tr_legacy_enquiry_status_prospect
AFTER UPDATE OF status ON public_enquiries
WHEN OLD.status<>NEW.status
BEGIN
 UPDATE academy_prospects
 SET status=CASE NEW.status WHEN 'CLOSED' THEN 'LEGACY_CLOSED'
  WHEN 'CONTACTED' THEN 'CONTACTED' ELSE 'NEW' END,
  version=version+1,
  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE id=NEW.id AND status IN ('NEW','CONTACTED')
 AND status<>(CASE NEW.status WHEN 'CLOSED' THEN 'LEGACY_CLOSED'
  WHEN 'CONTACTED' THEN 'CONTACTED' ELSE 'NEW' END);
END;
