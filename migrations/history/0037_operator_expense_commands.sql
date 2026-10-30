-- Additive request evidence: historic expenses and journals remain untouched.
-- A request belongs to exactly one actor and normalized business payload forever.
CREATE TABLE IF NOT EXISTS finance_expense_command_keys (
  request_id TEXT PRIMARY KEY NOT NULL CHECK(length(request_id)=36),
  actor_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  expense_id TEXT NOT NULL UNIQUE,
  reference TEXT NOT NULL UNIQUE,
  audit_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- One SQL insert reserves the request, posts the existing balanced GL trigger,
-- creates attributable audit and checks the complete result atomically. An
-- exception in any trigger rolls back the command reservation as well.
CREATE TRIGGER IF NOT EXISTS post_operating_expense_command
AFTER INSERT ON finance_expense_command_keys
BEGIN
  -- Recheck current staff status and grant inside the financial transaction.
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM staff_memberships m JOIN academy_staff s ON s.linked_user_id=m.user_id
    WHERE m.user_id=NEW.actor_id AND m.active=1 AND s.status IN ('ACTIVE','ON_LEAVE')
      AND (m.role='OWNER' OR EXISTS(SELECT 1 FROM erp_permission_grants g
        WHERE g.user_id=m.user_id AND g.permission='accounting.expenses.post'))
  ) THEN RAISE(ABORT,'Expense permission changed') END;
  SELECT CASE WHEN
    json_type(NEW.payload_json,'$.amountPaisa')!='integer'
    OR json_extract(NEW.payload_json,'$.amountPaisa') NOT BETWEEN 1 AND 200000000
    OR json_extract(NEW.payload_json,'$.spentOn') IS NULL
    OR date(json_extract(NEW.payload_json,'$.spentOn')) IS NULL
    OR date(json_extract(NEW.payload_json,'$.spentOn'))!=json_extract(NEW.payload_json,'$.spentOn')
    OR json_extract(NEW.payload_json,'$.spentOn')>date('now','+6 hours')
  THEN RAISE(ABORT,'Invalid expense amount or Bangladesh business date') END;

  INSERT INTO finance_operating_expenses
    (id,reference,category,payee,description,spent_on,amount_paisa,payment_method,approved_by)
  VALUES(NEW.expense_id,NEW.reference,json_extract(NEW.payload_json,'$.category'),
    json_extract(NEW.payload_json,'$.payee'),json_extract(NEW.payload_json,'$.description'),
    json_extract(NEW.payload_json,'$.spentOn'),json_extract(NEW.payload_json,'$.amountPaisa'),
    json_extract(NEW.payload_json,'$.method'),NEW.actor_id);

  INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,after_json)
  VALUES(NEW.audit_id,'finance_expense',NEW.expense_id,'POSTED',NEW.actor_id,
    json_extract(NEW.payload_json,'$.reason'),
    json_set(NEW.payload_json,'$.requestId',NEW.request_id,'$.reference',NEW.reference));

  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM finance_journals j
    JOIN finance_journal_lines l ON l.journal_id=j.id
    JOIN finance_accounts a ON a.id=l.account_id
    WHERE j.reference='EXP:'||NEW.reference AND j.status='POSTED' AND j.posted_by=NEW.actor_id
    GROUP BY j.id
    HAVING COUNT(*)=2
      AND SUM(l.debit_paisa)=json_extract(NEW.payload_json,'$.amountPaisa')
      AND SUM(l.credit_paisa)=json_extract(NEW.payload_json,'$.amountPaisa')
      AND MIN(a.active)=1
      AND SUM(CASE WHEN l.account_id='sohoj-expense-operating'
        AND a.kind='EXPENSE'
        AND l.debit_paisa=json_extract(NEW.payload_json,'$.amountPaisa')
        AND l.credit_paisa=0 THEN 1 ELSE 0 END)=1
      AND SUM(CASE WHEN l.account_id=CASE json_extract(NEW.payload_json,'$.method')
          WHEN 'BANK' THEN 'sohoj-asset-bank' WHEN 'MFS' THEN 'sohoj-asset-mfs' ELSE 'sohoj-asset-cash' END
        AND a.kind='ASSET'
        AND l.credit_paisa=json_extract(NEW.payload_json,'$.amountPaisa')
        AND l.debit_paisa=0 THEN 1 ELSE 0 END)=1
  ) THEN RAISE(ABORT,'Expense journal is incomplete or unbalanced') END;

  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM erp_audit_events WHERE id=NEW.audit_id AND entity_id=NEW.expense_id
      AND entity_type='finance_expense' AND action='POSTED' AND actor_id=NEW.actor_id
  ) THEN RAISE(ABORT,'Expense audit evidence is missing') END;
END;

CREATE TRIGGER IF NOT EXISTS guard_expense_command_update
BEFORE UPDATE ON finance_expense_command_keys
BEGIN SELECT RAISE(ABORT,'Expense command evidence is immutable'); END;
CREATE TRIGGER IF NOT EXISTS guard_expense_command_delete
BEFORE DELETE ON finance_expense_command_keys
BEGIN SELECT RAISE(ABORT,'Expense command evidence is immutable'); END;

CREATE TRIGGER IF NOT EXISTS guard_posted_expense_update
BEFORE UPDATE ON finance_operating_expenses
BEGIN SELECT RAISE(ABORT,'Posted expense is immutable'); END;
CREATE TRIGGER IF NOT EXISTS guard_posted_expense_delete
BEFORE DELETE ON finance_operating_expenses
BEGIN SELECT RAISE(ABORT,'Posted expense is immutable'); END;
