-- Original Sohoj Academy ERP permission vocabulary on D1.
-- User-scoped grants are separate from Better Auth sessions and staff roles.
-- No implicit permissions are granted on migration or user signup.
CREATE TABLE IF NOT EXISTS erp_permission_grants (
  user_id TEXT NOT NULL REFERENCES staff_memberships(user_id) ON DELETE CASCADE,
  permission TEXT NOT NULL CHECK(length(permission) BETWEEN 3 AND 120),
  granted_by TEXT REFERENCES staff_memberships(user_id) ON DELETE SET NULL,
  granted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(user_id,permission)
);
CREATE INDEX IF NOT EXISTS idx_erp_permission_grants_user ON erp_permission_grants(user_id);
