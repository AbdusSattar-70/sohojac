-- Real chart of accounts (reference data, not synthetic transactions).
-- Initial billed coaching fees are deferred until earned; no revenue is invented.
INSERT OR IGNORE INTO finance_accounts(id,code,name,kind) VALUES
 ('sohoj-asset-cash','1000','Cash on hand','ASSET'),
 ('sohoj-asset-bank','1010','Bank deposits','ASSET'),
 ('sohoj-asset-mfs','1020','Mobile financial services','ASSET'),
 ('sohoj-asset-ar','1100','Student receivables','ASSET'),
 ('sohoj-liab-deferred','2200','Deferred tuition and admission fees','LIABILITY');

-- Issuing a real student invoice posts a balanced receivable/deferred-fees entry.
-- An invoice for zero creates no journal. All trigger effects are atomic with the invoice.
CREATE TRIGGER IF NOT EXISTS post_student_invoice_gl
AFTER INSERT ON finance_invoices
WHEN NEW.status='ISSUED' AND NEW.amount_paisa>0
BEGIN
  INSERT INTO finance_journals(id,reference,description,posted_by,posted_at,status)
  VALUES (lower(hex(randomblob(16))),'INV:'||NEW.invoice_no,
    'Student initial fee invoice',NEW.created_by,strftime('%Y-%m-%dT%H:%M:%fZ','now'),'POSTED');
  INSERT INTO finance_journal_lines(id,journal_id,account_id,debit_paisa,credit_paisa)
  VALUES(lower(hex(randomblob(16))),
    (SELECT id FROM finance_journals WHERE reference='INV:'||NEW.invoice_no),
    'sohoj-asset-ar',NEW.amount_paisa,0);
  INSERT INTO finance_journal_lines(id,journal_id,account_id,debit_paisa,credit_paisa)
  VALUES(lower(hex(randomblob(16))),
    (SELECT id FROM finance_journals WHERE reference='INV:'||NEW.invoice_no),
    'sohoj-liab-deferred',0,NEW.amount_paisa);
END;

-- No over-allocation, cross-student allocation or payment exceeding the invoice.
CREATE TRIGGER IF NOT EXISTS guard_payment_allocation
BEFORE INSERT ON finance_allocations
BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM finance_invoices i JOIN finance_payments p
      ON p.student_id=i.student_id
    WHERE i.id=NEW.invoice_id AND p.id=NEW.payment_id
      AND i.status IN ('ISSUED','PARTIAL') AND NEW.amount_paisa>0
      AND NEW.amount_paisa<=i.amount_paisa-i.paid_paisa
      AND NEW.amount_paisa<=p.amount_paisa-COALESCE((
        SELECT SUM(a.amount_paisa) FROM finance_allocations a WHERE a.payment_id=p.id
      ),0)
  ) THEN RAISE(ABORT,'Payment exceeds outstanding or owner mismatch') END;
END;

-- Only allocations decrease receivables. One payment may be split across invoices.
-- This first UI intentionally collects against one invoice at a time.
CREATE TRIGGER IF NOT EXISTS post_payment_allocation_gl
AFTER INSERT ON finance_allocations
BEGIN
  UPDATE finance_invoices
  SET paid_paisa=paid_paisa+NEW.amount_paisa,
      status=CASE WHEN paid_paisa+NEW.amount_paisa=amount_paisa THEN 'PAID' ELSE 'PARTIAL' END
  WHERE id=NEW.invoice_id;
  INSERT INTO finance_journals(id,reference,description,posted_by,posted_at,status)
  SELECT lower(hex(randomblob(16))),'PAY:'||p.receipt_no||':'||NEW.id,
    'Payment allocated to student invoice',p.received_by,
    strftime('%Y-%m-%dT%H:%M:%fZ','now'),'POSTED'
  FROM finance_payments p WHERE p.id=NEW.payment_id;
  INSERT INTO finance_journal_lines(id,journal_id,account_id,debit_paisa,credit_paisa)
  SELECT lower(hex(randomblob(16))),j.id,
    CASE p.payment_method WHEN 'BANK' THEN 'sohoj-asset-bank'
      WHEN 'MFS' THEN 'sohoj-asset-mfs' ELSE 'sohoj-asset-cash' END,
    NEW.amount_paisa,0
  FROM finance_payments p JOIN finance_journals j
    ON j.reference='PAY:'||p.receipt_no||':'||NEW.id
  WHERE p.id=NEW.payment_id;
  INSERT INTO finance_journal_lines(id,journal_id,account_id,debit_paisa,credit_paisa)
  SELECT lower(hex(randomblob(16))),j.id,'sohoj-asset-ar',0,NEW.amount_paisa
  FROM finance_payments p JOIN finance_journals j
    ON j.reference='PAY:'||p.receipt_no||':'||NEW.id
  WHERE p.id=NEW.payment_id;
END;

-- Posted ledger entries are immutable. Corrections must use separate reversing journals.
CREATE TRIGGER IF NOT EXISTS guard_posted_journal_update
BEFORE UPDATE ON finance_journals
WHEN OLD.status='POSTED'
BEGIN SELECT RAISE(ABORT,'Posted journal is immutable'); END;
CREATE TRIGGER IF NOT EXISTS guard_posted_journal_delete
BEFORE DELETE ON finance_journals
WHEN OLD.status='POSTED'
BEGIN SELECT RAISE(ABORT,'Posted journal is immutable'); END;
CREATE TRIGGER IF NOT EXISTS guard_posted_line_update
BEFORE UPDATE ON finance_journal_lines
WHEN EXISTS (SELECT 1 FROM finance_journals WHERE id=OLD.journal_id AND status='POSTED')
BEGIN SELECT RAISE(ABORT,'Posted lines are immutable'); END;
CREATE TRIGGER IF NOT EXISTS guard_posted_line_delete
BEFORE DELETE ON finance_journal_lines
WHEN EXISTS (SELECT 1 FROM finance_journals WHERE id=OLD.journal_id AND status='POSTED')
BEGIN SELECT RAISE(ABORT,'Posted lines are immutable'); END;
