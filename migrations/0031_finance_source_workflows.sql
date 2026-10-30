-- Original receivables / collection follow-up on the canonical D1 invoice ledger.
-- Nonfinancial evidence only: these commands never post payments or adjustments.
CREATE TABLE IF NOT EXISTS finance_collection_promises (
 id TEXT PRIMARY KEY NOT NULL,
 invoice_id TEXT NOT NULL REFERENCES finance_invoices(id) ON DELETE RESTRICT,
 amount_paisa INTEGER NOT NULL CHECK(typeof(amount_paisa)='integer' AND amount_paisa>0),
 due_on TEXT NOT NULL CHECK(length(due_on)=10 AND date(due_on) IS NOT NULL AND date(due_on)=due_on),
 baseline_paid_paisa INTEGER NOT NULL CHECK(typeof(baseline_paid_paisa)='integer' AND baseline_paid_paisa>=0),
 status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','COMPLETED','CANCELLED')),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 5 AND 1000),
 actor_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_collection_promise
 ON finance_collection_promises(invoice_id) WHERE status='OPEN';
CREATE TABLE IF NOT EXISTS finance_collection_events (
 id TEXT PRIMARY KEY NOT NULL,
 invoice_id TEXT NOT NULL REFERENCES finance_invoices(id) ON DELETE RESTRICT,
 promise_id TEXT REFERENCES finance_collection_promises(id) ON DELETE RESTRICT,
 action TEXT NOT NULL CHECK(action IN ('PROMISE','COMPLETE','CANCEL','CONTACT')),
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 5 AND 1000),
 actor_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_collection_events_invoice
 ON finance_collection_events(invoice_id,action,created_at DESC);
CREATE TABLE IF NOT EXISTS finance_collection_command_keys (
 request_id TEXT PRIMARY KEY NOT NULL,
 invoice_id TEXT NOT NULL REFERENCES finance_invoices(id) ON DELETE RESTRICT,
 actor_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 result_json TEXT NOT NULL CHECK(json_valid(result_json)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TRIGGER IF NOT EXISTS collection_promise_no_delete
 BEFORE DELETE ON finance_collection_promises
 BEGIN SELECT RAISE(ABORT,'Collection promises cannot be deleted'); END;
CREATE TRIGGER IF NOT EXISTS collection_promise_controlled_update
 BEFORE UPDATE ON finance_collection_promises
 WHEN OLD.status<>'OPEN' OR NEW.status NOT IN ('COMPLETED','CANCELLED')
 OR NEW.revision<>OLD.revision+1 OR NEW.id<>OLD.id OR NEW.invoice_id<>OLD.invoice_id
 OR NEW.amount_paisa<>OLD.amount_paisa OR NEW.due_on<>OLD.due_on
 OR NEW.baseline_paid_paisa<>OLD.baseline_paid_paisa
 OR NEW.reason<>OLD.reason OR NEW.actor_id<>OLD.actor_id OR NEW.created_at<>OLD.created_at
 BEGIN SELECT RAISE(ABORT,'Only a controlled promise closure is allowed'); END;
CREATE TRIGGER IF NOT EXISTS collection_event_no_update
 BEFORE UPDATE ON finance_collection_events
 BEGIN SELECT RAISE(ABORT,'Collection evidence is immutable'); END;
CREATE TRIGGER IF NOT EXISTS collection_event_no_delete
 BEFORE DELETE ON finance_collection_events
 BEGIN SELECT RAISE(ABORT,'Collection evidence is immutable'); END;
CREATE TRIGGER IF NOT EXISTS collection_key_no_update
 BEFORE UPDATE ON finance_collection_command_keys
 BEGIN SELECT RAISE(ABORT,'Collection request identity is immutable'); END;
CREATE TRIGGER IF NOT EXISTS collection_key_no_delete
 BEFORE DELETE ON finance_collection_command_keys
 BEGIN SELECT RAISE(ABORT,'Collection request identity is immutable'); END;
