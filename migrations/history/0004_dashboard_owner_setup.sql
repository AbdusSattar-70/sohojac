-- First owner self-setup is activated only by an operator with Cloudflare D1
-- Console access. Public sign-up stays disabled. No tokens are seeded here.
-- Only one first-owner ticket exists; it is irrevocably consumed after use.
CREATE TABLE IF NOT EXISTS staff_owner_setup (
  id TEXT PRIMARY KEY NOT NULL CHECK (id = 'first-owner'),
  email TEXT NOT NULL CHECK (length(email) BETWEEN 5 AND 180),
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 2 AND 100),
  token TEXT NOT NULL CHECK (length(token) = 64),
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  claim_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
