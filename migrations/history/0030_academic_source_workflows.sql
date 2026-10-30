-- Source-first Programme Offerings and immutable Fee Plan versions.
-- Reuse public_programme_offerings and academy_fee_plans; existing IDs, prices
-- and admission snapshots remain intact. Legacy rows are not assigned invented
-- source versions or effective dates.
ALTER TABLE academy_fee_plans ADD COLUMN source_version INTEGER CHECK(source_version IS NULL OR source_version>=1);
ALTER TABLE academy_fee_plans ADD COLUMN source_status TEXT CHECK(source_status IN ('DRAFT','ACTIVE','RETIRED'));
ALTER TABLE academy_fee_plans ADD COLUMN billing_cycle TEXT CHECK(billing_cycle IN ('MONTHLY','TERM','ONE_TIME'));
ALTER TABLE academy_fee_plans ADD COLUMN due_day INTEGER CHECK(due_day BETWEEN 1 AND 28);
ALTER TABLE academy_fee_plans ADD COLUMN currency_code TEXT;
ALTER TABLE academy_fee_plans ADD COLUMN effective_from TEXT;
ALTER TABLE academy_fee_plans ADD COLUMN effective_to TEXT;
ALTER TABLE academy_fee_plans ADD COLUMN change_reason TEXT;
ALTER TABLE academy_fee_plans ADD COLUMN created_by TEXT REFERENCES "user"(id) ON DELETE RESTRICT;
ALTER TABLE academy_fee_plans ADD COLUMN created_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_source_fee_plan_versions
 ON academy_fee_plans(offering_id,source_version) WHERE source_version IS NOT NULL;
CREATE TABLE IF NOT EXISTS academy_fee_plan_components (
 id TEXT PRIMARY KEY NOT NULL,
 plan_id TEXT NOT NULL REFERENCES academy_fee_plans(id) ON DELETE RESTRICT,
 code TEXT NOT NULL,
 name TEXT NOT NULL,
 amount_paisa INTEGER NOT NULL CHECK(amount_paisa>=0),
 charge_type TEXT NOT NULL CHECK(charge_type IN ('TUITION','ADMISSION','EXAM','MATERIAL','OTHER')),
 recurrence TEXT NOT NULL CHECK(recurrence IN ('PER_CYCLE','ONE_TIME')),
 sort_order INTEGER NOT NULL CHECK(sort_order BETWEEN 0 AND 29),
 UNIQUE(plan_id,code)
);
CREATE TABLE IF NOT EXISTS academy_offering_command_keys (
 request_id TEXT PRIMARY KEY NOT NULL,
 actor_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 command TEXT NOT NULL,
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 entity_id TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
ALTER TABLE academy_offering_subjects ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- Source fee terms become immutable on publication. Retirement changes only
-- availability/end date; existing admissions keep their referenced plan/amounts.
CREATE TRIGGER IF NOT EXISTS protect_source_fee_plan_terms
BEFORE UPDATE ON academy_fee_plans
WHEN OLD.source_version IS NOT NULL AND OLD.source_status IN ('ACTIVE','RETIRED')
 AND (NEW.offering_id IS NOT OLD.offering_id OR NEW.title IS NOT OLD.title
 OR NEW.monthly_amount_paisa IS NOT OLD.monthly_amount_paisa
 OR NEW.admission_amount_paisa IS NOT OLD.admission_amount_paisa
 OR NEW.source_version IS NOT OLD.source_version
 OR NEW.billing_cycle IS NOT OLD.billing_cycle OR NEW.due_day IS NOT OLD.due_day
 OR NEW.currency_code IS NOT OLD.currency_code OR NEW.effective_from IS NOT OLD.effective_from
 OR NEW.change_reason IS NOT OLD.change_reason OR NEW.created_by IS NOT OLD.created_by
 OR NEW.created_at IS NOT OLD.created_at
 OR NEW.source_status NOT IN ('ACTIVE','RETIRED')
 OR (OLD.source_status='RETIRED' AND NEW.source_status<>'RETIRED'))
BEGIN SELECT RAISE(ABORT,'Published fee terms are immutable; publish a new plan version'); END;
CREATE TRIGGER IF NOT EXISTS protect_source_fee_plan_state
BEFORE UPDATE ON academy_fee_plans
WHEN NEW.source_version IS NOT NULL AND
 (NEW.active<>CASE WHEN NEW.source_status='ACTIVE' THEN 1 ELSE 0 END
  OR (NEW.source_status='ACTIVE' AND NOT EXISTS(
    SELECT 1 FROM academy_fee_plan_components c WHERE c.plan_id=NEW.id
    AND c.charge_type='TUITION' AND c.recurrence='PER_CYCLE' AND c.amount_paisa>0))
  OR (NEW.source_status='ACTIVE' AND (NEW.monthly_amount_paisa<>(SELECT COALESCE(SUM(amount_paisa),0) FROM academy_fee_plan_components WHERE plan_id=NEW.id AND recurrence='PER_CYCLE')
    OR NEW.admission_amount_paisa<>(SELECT COALESCE(SUM(amount_paisa),0) FROM academy_fee_plan_components WHERE plan_id=NEW.id AND recurrence='ONE_TIME'))))
BEGIN SELECT RAISE(ABORT,'A source plan requires valid published components and consistent state'); END;
CREATE TRIGGER IF NOT EXISTS reject_legacy_plan_after_source_publish
BEFORE INSERT ON academy_fee_plans
WHEN NEW.source_version IS NULL AND EXISTS(
 SELECT 1 FROM academy_fee_plans p WHERE p.offering_id=NEW.offering_id AND p.source_version IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'Use the source Fee Plan workflow for this offering'); END;
CREATE TRIGGER IF NOT EXISTS reject_legacy_plan_reactivation
BEFORE UPDATE ON academy_fee_plans
WHEN NEW.source_version IS NULL AND NEW.active=1 AND EXISTS(
 SELECT 1 FROM academy_fee_plans p WHERE p.offering_id=NEW.offering_id AND p.source_version IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'Use the source Fee Plan workflow for this offering'); END;
CREATE TRIGGER IF NOT EXISTS protect_source_component_insert
BEFORE INSERT ON academy_fee_plan_components
WHEN NOT EXISTS(SELECT 1 FROM academy_fee_plans p WHERE p.id=NEW.plan_id AND p.source_status='DRAFT')
BEGIN SELECT RAISE(ABORT,'Published fee components cannot change'); END;
CREATE TRIGGER IF NOT EXISTS protect_source_component_update
BEFORE UPDATE ON academy_fee_plan_components
WHEN NOT EXISTS(SELECT 1 FROM academy_fee_plans p WHERE p.id=OLD.plan_id AND p.source_status='DRAFT')
 OR NOT EXISTS(SELECT 1 FROM academy_fee_plans p WHERE p.id=NEW.plan_id AND p.source_status='DRAFT')
BEGIN SELECT RAISE(ABORT,'Published fee components cannot change'); END;
CREATE TRIGGER IF NOT EXISTS protect_source_component_delete
BEFORE DELETE ON academy_fee_plan_components
WHEN NOT EXISTS(SELECT 1 FROM academy_fee_plans p WHERE p.id=OLD.plan_id AND p.source_status='DRAFT')
BEGIN SELECT RAISE(ABORT,'Published fee components cannot change'); END;
