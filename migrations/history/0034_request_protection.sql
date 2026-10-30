-- Bounded fixed-window counters; hashed keys contain no raw IP/email/password.
CREATE TABLE IF NOT EXISTS security_request_limits (
 key TEXT PRIMARY KEY NOT NULL,
 hits INTEGER NOT NULL CHECK(hits>0),
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_security_limits_expiry ON security_request_limits(expires_at);
