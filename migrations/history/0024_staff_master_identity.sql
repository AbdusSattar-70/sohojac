-- Restore the source staff master identity, independent of Better Auth.
-- Source staff_no_seq + generate_staff_no => SA-STF-000001 (six digits).
-- AUTOINCREMENT is persistent and safely serialized by SQLite/D1, not MAX+1.
-- Never delete/reuse a staff_seq. Existing staff memberships are backfilled.
CREATE TABLE IF NOT EXISTS academy_staff (
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
CREATE INDEX IF NOT EXISTS idx_academy_staff_status ON academy_staff(status,staff_seq);
CREATE INDEX IF NOT EXISTS idx_academy_staff_name ON academy_staff(full_name);

-- Reconcile only verified existing Cloudflare user/member links.
-- Historical Supabase staff records must be imported separately, not
-- guessed by email or name. Stable order for the initial D1 backfill.
INSERT INTO academy_staff(linked_user_id,full_name,email,joined_on)
SELECT m.user_id,u.name,u.email,substr(m.created_at,1,10)
FROM staff_memberships m JOIN "user" u ON u.id=m.user_id
WHERE NOT EXISTS (SELECT 1 FROM academy_staff s WHERE s.linked_user_id=m.user_id)
ORDER BY m.created_at,m.user_id;

-- A new verified staff membership creates exactly one staff master record,
-- in the SAME transaction as owner setup/invitation activation.
CREATE TRIGGER IF NOT EXISTS tr_staff_identity_on_membership
AFTER INSERT ON staff_memberships
BEGIN
  INSERT INTO academy_staff(linked_user_id,full_name,email,joined_on)
  SELECT NEW.user_id,u.name,u.email,substr(NEW.created_at,1,10)
  FROM "user" u
  WHERE u.id=NEW.user_id
    AND NOT EXISTS (SELECT 1 FROM academy_staff s WHERE s.linked_user_id=NEW.user_id);
END;
