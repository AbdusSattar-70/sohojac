-- One durable, actor-owned result for every intentional student payment.
-- Existing receipts, allocations, journals and legacy admission keys are retained.
CREATE TABLE finance_payment_commands (
 request_id TEXT PRIMARY KEY NOT NULL,
 actor_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 payload_hash TEXT NOT NULL CHECK(length(payload_hash)=64),
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 payment_id TEXT NOT NULL UNIQUE REFERENCES finance_payments(id) ON DELETE RESTRICT,
 allocation_id TEXT NOT NULL UNIQUE REFERENCES finance_allocations(id) ON DELETE RESTRICT,
 audit_id TEXT NOT NULL UNIQUE REFERENCES erp_audit_events(id) ON DELETE RESTRICT,
 invoice_id TEXT NOT NULL REFERENCES finance_invoices(id) ON DELETE RESTRICT,
 admission_id TEXT REFERENCES academy_admissions(id) ON DELETE RESTRICT,
 receipt_no TEXT NOT NULL UNIQUE,
 amount_paisa INTEGER NOT NULL CHECK(amount_paisa BETWEEN 1 AND 200000000),
 payment_method TEXT NOT NULL CHECK(payment_method IN ('CASH','BANK','MFS')),
 reference TEXT,
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 5 AND 500),
 remaining_due_paisa INTEGER NOT NULL CHECK(remaining_due_paisa>=0),
 received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TRIGGER post_record_student_payment
AFTER INSERT ON finance_payment_commands
BEGIN
 -- A revoked grant or staff membership must also fail inside the write.
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM staff_memberships m JOIN academy_staff s ON s.linked_user_id=m.user_id
  WHERE m.user_id=NEW.actor_id AND m.active=1 AND s.status IN ('ACTIVE','ON_LEAVE')
   AND (m.role='OWNER' OR EXISTS(SELECT 1 FROM erp_permission_grants g
    WHERE g.user_id=m.user_id AND g.permission='finance.payments.post'))
 ) THEN RAISE(ABORT,'Payment permission changed') END;
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM finance_invoices i WHERE i.id=NEW.invoice_id
   AND i.status IN ('ISSUED','PARTIAL')
   AND (NEW.admission_id IS NULL OR i.admission_id=NEW.admission_id)
   AND i.amount_paisa-i.paid_paisa>=NEW.amount_paisa
   AND i.amount_paisa-i.paid_paisa-NEW.amount_paisa=NEW.remaining_due_paisa
 ) THEN RAISE(ABORT,'Invoice balance changed') END;
 INSERT INTO finance_payments(id,receipt_no,student_id,amount_paisa,payment_method,received_by,reference,received_at)
 SELECT NEW.payment_id,NEW.receipt_no,i.student_id,NEW.amount_paisa,NEW.payment_method,
  NEW.actor_id,NEW.reference,NEW.received_at FROM finance_invoices i WHERE i.id=NEW.invoice_id;
 INSERT INTO finance_allocations(id,payment_id,invoice_id,amount_paisa)
 VALUES(NEW.allocation_id,NEW.payment_id,NEW.invoice_id,NEW.amount_paisa);
 INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,after_json)
 VALUES(NEW.audit_id,'finance_payment',NEW.payment_id,'RECEIVED_AND_ALLOCATED',NEW.actor_id,NEW.reason,
  json_object('requestId',NEW.request_id,'receiptNo',NEW.receipt_no,'invoiceId',NEW.invoice_id,
   'amountPaisa',NEW.amount_paisa,'method',NEW.payment_method,'remainingDuePaisa',NEW.remaining_due_paisa));
 -- Keep admission request evidence available for safe rollback/old-client replay.
 INSERT INTO academy_admission_collection_keys(request_id,payment_id,admission_id,actor_id)
 SELECT NEW.request_id,NEW.payment_id,NEW.admission_id,NEW.actor_id WHERE NEW.admission_id IS NOT NULL;
 -- Prove the existing allocation trigger posted the expected two-sided ledger.
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM finance_journals j WHERE j.reference='PAY:'||NEW.receipt_no||':'||NEW.allocation_id
   AND j.status='POSTED' AND j.posted_by=NEW.actor_id
   AND (SELECT COUNT(*) FROM finance_journal_lines l WHERE l.journal_id=j.id)=2
   AND (SELECT SUM(l.debit_paisa) FROM finance_journal_lines l WHERE l.journal_id=j.id)=NEW.amount_paisa
   AND (SELECT SUM(l.credit_paisa) FROM finance_journal_lines l WHERE l.journal_id=j.id)=NEW.amount_paisa
   AND EXISTS(SELECT 1 FROM finance_journal_lines l JOIN finance_accounts a ON a.id=l.account_id
    WHERE l.journal_id=j.id AND a.active=1 AND a.kind='ASSET'
     AND a.id=CASE NEW.payment_method WHEN 'BANK' THEN 'sohoj-asset-bank'
      WHEN 'MFS' THEN 'sohoj-asset-mfs' ELSE 'sohoj-asset-cash' END
     AND l.debit_paisa=NEW.amount_paisa AND l.credit_paisa=0)
   AND EXISTS(SELECT 1 FROM finance_journal_lines l JOIN finance_accounts a ON a.id=l.account_id
    WHERE l.journal_id=j.id AND a.id='sohoj-asset-ar' AND a.active=1 AND a.kind='ASSET'
     AND l.credit_paisa=NEW.amount_paisa AND l.debit_paisa=0)
 ) THEN RAISE(ABORT,'Payment ledger could not be verified') END;
END;
CREATE TRIGGER guard_payment_command_update BEFORE UPDATE ON finance_payment_commands
BEGIN SELECT RAISE(ABORT,'Payment command evidence is immutable'); END;
CREATE TRIGGER guard_payment_command_delete BEFORE DELETE ON finance_payment_commands
BEGIN SELECT RAISE(ABORT,'Payment command evidence is immutable'); END;
