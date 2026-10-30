-- Additive, deploy-safe optimistic concurrency for academy batch management.
ALTER TABLE academy_batches ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1);
CREATE INDEX IF NOT EXISTS idx_batch_year_status ON academy_batches(year_id,status);
