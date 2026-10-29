-- Operating expense ledger. No historical transactions are synthesized.
INSERT OR IGNORE INTO finance_accounts(id,code,name,kind)
VALUES ('sohoj-expense-operating','5100','Operating expenses','EXPENSE');

CREATE TABLE IF NOT EXISTS finance_operating_expenses (
  id TEXT PRIMARY KEY NOT NULL,
  reference TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK(category IN (
    'RENT','UTILITIES','TEACHING_MATERIALS','MARKETING','MAINTENANCE','TRANSPORT','OTHER'
  )),
  payee TEXT NOT NULL CHECK(length(payee) BETWEEN 2 AND 160),
  description TEXT NOT NULL CHECK(length(description) BETWEEN 3 AND 500),
  spent_on TEXT NOT NULL,
  amount_paisa INTEGER NOT NULL CHECK(amount_paisa BETWEEN 1 AND 200000000),
  payment_method TEXT NOT NULL CHECK(payment_method IN ('CASH','BANK','MFS')),
  approved_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_operating_expenses_date ON finance_operating_expenses(spent_on DESC);

-- Expense cash outflow is recorded as balanced debit expense / credit cash/bank/MFS.
-- The journal is posted with the same transaction as the expense record.
CREATE TRIGGER IF NOT EXISTS post_operating_expense_gl
AFTER INSERT ON finance_operating_expenses
BEGIN
  INSERT INTO finance_journals(id,reference,description,posted_by,posted_at,status)
  VALUES(lower(hex(randomblob(16))),'EXP:'||NEW.reference,
    'Operating expense: '||NEW.category,NEW.approved_by,
    strftime('%Y-%m-%dT%H:%M:%fZ','now'),'POSTED');
  INSERT INTO finance_journal_lines(id,journal_id,account_id,debit_paisa,credit_paisa)
  VALUES(lower(hex(randomblob(16))),
    (SELECT id FROM finance_journals WHERE reference='EXP:'||NEW.reference),
    'sohoj-expense-operating',NEW.amount_paisa,0);
  INSERT INTO finance_journal_lines(id,journal_id,account_id,debit_paisa,credit_paisa)
  VALUES(lower(hex(randomblob(16))),
    (SELECT id FROM finance_journals WHERE reference='EXP:'||NEW.reference),
    CASE NEW.payment_method
      WHEN 'BANK' THEN 'sohoj-asset-bank'
      WHEN 'MFS' THEN 'sohoj-asset-mfs'
      ELSE 'sohoj-asset-cash'
    END,0,NEW.amount_paisa);
END;
