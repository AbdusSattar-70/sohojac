-- Monetary terms are always integer paisa. Every edit is version checked and audited.
ALTER TABLE academy_fee_plans ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1);
CREATE INDEX IF NOT EXISTS idx_fee_plan_offering ON academy_fee_plans(offering_id,active);
