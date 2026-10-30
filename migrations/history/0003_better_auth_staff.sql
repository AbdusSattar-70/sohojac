-- Staff CRM. Apply only after reviewing the migration list for the existing D1.
-- Better Auth core tables use its default SQLite field names and epoch-ms dates.
-- No public signup and no automatic staff rows are created.
CREATE TABLE IF NOT EXISTS "user" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "emailVerified" INTEGER NOT NULL DEFAULT 0,
  "image" TEXT,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS "session" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "expiresAt" INTEGER NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "createdAt" INTEGER NOT NULL,
  "updatedAt" INTEGER NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "idx_session_user" ON "session" ("userId");
CREATE TABLE IF NOT EXISTS "account" (
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
CREATE INDEX IF NOT EXISTS "idx_account_user" ON "account" ("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_account_provider" ON "account" ("providerId", "accountId");
CREATE TABLE IF NOT EXISTS "verification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" INTEGER NOT NULL,
  "createdAt" INTEGER,
  "updatedAt" INTEGER
);
CREATE INDEX IF NOT EXISTS "idx_verification_identifier" ON "verification" ("identifier");

-- Authorization is deliberately independent of Better Auth's user records:
-- a valid session without an active staff membership has zero CRM permissions.
CREATE TABLE IF NOT EXISTS staff_memberships (
  user_id TEXT NOT NULL PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('OWNER','ADMIN','OPERATOR','TEACHER')),
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_only_one_owner
  ON staff_memberships (role) WHERE role = 'OWNER' AND active = 1;

CREATE TABLE IF NOT EXISTS staff_prospect_events (
  id TEXT PRIMARY KEY NOT NULL,
  enquiry_id TEXT NOT NULL REFERENCES public_enquiries(id) ON DELETE RESTRICT,
  actor_user_id TEXT NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
  from_status TEXT NOT NULL CHECK (from_status IN ('NEW','CONTACTED','CLOSED')),
  to_status TEXT NOT NULL CHECK (to_status IN ('NEW','CONTACTED','CLOSED')),
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
  occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_staff_prospect_events_enquiry
  ON staff_prospect_events (enquiry_id, occurred_at DESC);
