-- A unique claim identifier binds invitation activation to one successful
-- conditional UPDATE; concurrent/replayed requests cannot reuse a consumed code.
ALTER TABLE staff_invitation_tokens ADD COLUMN claim_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_invitation_claim_id
  ON staff_invitation_tokens(claim_id) WHERE claim_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_staff_invite_expiry
  ON staff_invitation_tokens(request_id, expires_at DESC, created_at DESC);
