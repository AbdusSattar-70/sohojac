-- Final domain guards and business triggers. No migration-only snapshot guards.
CREATE TRIGGER post_student_invoice_gl
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

CREATE TRIGGER guard_payment_allocation
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

CREATE TRIGGER post_payment_allocation_gl
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

CREATE TRIGGER guard_posted_journal_update
BEFORE UPDATE ON finance_journals
WHEN OLD.status='POSTED'
BEGIN SELECT RAISE(ABORT,'Posted journal is immutable'); END;

CREATE TRIGGER guard_posted_journal_delete
BEFORE DELETE ON finance_journals
WHEN OLD.status='POSTED'
BEGIN SELECT RAISE(ABORT,'Posted journal is immutable'); END;

CREATE TRIGGER guard_posted_line_update
BEFORE UPDATE ON finance_journal_lines
WHEN EXISTS (SELECT 1 FROM finance_journals WHERE id=OLD.journal_id AND status='POSTED')
BEGIN SELECT RAISE(ABORT,'Posted lines are immutable'); END;

CREATE TRIGGER guard_posted_line_delete
BEFORE DELETE ON finance_journal_lines
WHEN EXISTS (SELECT 1 FROM finance_journals WHERE id=OLD.journal_id AND status='POSTED')
BEGIN SELECT RAISE(ABORT,'Posted lines are immutable'); END;

CREATE TRIGGER post_operating_expense_gl
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

CREATE TRIGGER guard_session_overlap
BEFORE INSERT ON academy_class_sessions
WHEN NEW.status!='CANCELLED'
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM academy_class_sessions existing
    WHERE existing.batch_id=NEW.batch_id
      AND existing.class_on=NEW.class_on
      AND existing.status!='CANCELLED'
      AND NEW.starts_at<existing.ends_at
      AND NEW.ends_at>existing.starts_at
  ) THEN RAISE(ABORT,'Overlapping session in the same batch') END;
END;

CREATE TRIGGER publish_subject_assignment
AFTER INSERT ON academy_offering_subjects
BEGIN
  UPDATE public_programme_offerings SET
    subjects_json=(SELECT json_group_array(json_object('id',s.id,'code',s.code,'name',s.name))
      FROM academy_offering_subjects j JOIN academy_subjects s ON s.id=j.subject_id
      WHERE j.offering_id=NEW.offering_id AND s.active=1),
    version=version+1
  WHERE id=NEW.offering_id;
END;

CREATE TRIGGER unpublish_subject_assignment
AFTER DELETE ON academy_offering_subjects
BEGIN
  UPDATE public_programme_offerings SET
    subjects_json=(SELECT json_group_array(json_object('id',s.id,'code',s.code,'name',s.name))
      FROM academy_offering_subjects j JOIN academy_subjects s ON s.id=j.subject_id
      WHERE j.offering_id=OLD.offering_id AND s.active=1),
    version=version+1
  WHERE id=OLD.offering_id;
END;

CREATE TRIGGER update_linked_subject_cards
AFTER UPDATE OF name,active ON academy_subjects
BEGIN
  UPDATE public_programme_offerings SET
    subjects_json=(SELECT json_group_array(json_object('id',s.id,'code',s.code,'name',s.name))
      FROM academy_offering_subjects j JOIN academy_subjects s ON s.id=j.subject_id
      WHERE j.offering_id=public_programme_offerings.id AND s.active=1),
    version=version+1
  WHERE id IN (SELECT offering_id FROM academy_offering_subjects WHERE subject_id=NEW.id);
END;

CREATE TRIGGER tr_staff_identity_on_membership
AFTER INSERT ON staff_memberships
BEGIN
  INSERT INTO academy_staff(linked_user_id,full_name,email,joined_on)
  SELECT NEW.user_id,u.name,u.email,substr(NEW.created_at,1,10)
  FROM "user" u
  WHERE u.id=NEW.user_id
    AND NOT EXISTS (SELECT 1 FROM academy_staff s WHERE s.linked_user_id=NEW.user_id);
END;

CREATE TRIGGER tr_new_public_enquiry_prospect
AFTER INSERT ON public_enquiries
BEGIN
 INSERT INTO academy_prospects(id,status,created_at)
 VALUES (NEW.id,
  CASE NEW.status WHEN 'CLOSED' THEN 'LEGACY_CLOSED'
   WHEN 'CONTACTED' THEN 'CONTACTED' ELSE 'NEW' END,
  NEW.submitted_at);
END;

CREATE TRIGGER tr_legacy_enquiry_status_prospect
AFTER UPDATE OF status ON public_enquiries
WHEN OLD.status<>NEW.status
BEGIN
 UPDATE academy_prospects
 SET status=CASE NEW.status WHEN 'CLOSED' THEN 'LEGACY_CLOSED'
  WHEN 'CONTACTED' THEN 'CONTACTED' ELSE 'NEW' END,
  version=version+1,
  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE id=NEW.id AND status IN ('NEW','CONTACTED')
 AND status<>(CASE NEW.status WHEN 'CLOSED' THEN 'LEGACY_CLOSED'
  WHEN 'CONTACTED' THEN 'CONTACTED' ELSE 'NEW' END);
END;

CREATE TRIGGER guard_active_batch_enrollment
BEFORE INSERT ON academy_enrollments WHEN NEW.status='ACTIVE'
BEGIN
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM academy_batches b JOIN academy_admissions a ON a.id=NEW.admission_id
  JOIN academy_students s ON s.id=NEW.student_id
  WHERE b.id=NEW.batch_id AND b.status='ACTIVE' AND b.offering_id=a.offering_id
   AND a.student_id=NEW.student_id AND s.merged_into_id IS NULL AND s.status<>'ARCHIVED'
 ) THEN RAISE(ABORT,'Invalid canonical student or active offering-linked batch') END;
 SELECT CASE WHEN (SELECT COUNT(*) FROM academy_enrollments WHERE batch_id=NEW.batch_id AND status='ACTIVE')
  >=(SELECT min(capacity,12) FROM academy_batches WHERE id=NEW.batch_id)
  THEN RAISE(ABORT,'Batch capacity exceeded') END;
 SELECT CASE WHEN EXISTS(
  SELECT 1 FROM academy_enrollments e JOIN academy_batches b ON b.id=e.batch_id
  JOIN public_programme_offerings o ON o.id=b.offering_id
  JOIN academy_batches nb ON nb.id=NEW.batch_id
  JOIN public_programme_offerings no ON no.id=nb.offering_id
  WHERE e.student_id=NEW.student_id AND e.status='ACTIVE'
   AND COALESCE(b.year_id,o.academic_year_id,CASE WHEN o.operation_kind='TRAINING' OR length(trim(o.academic_year_name))=0 THEN 'offering:'||o.id ELSE 'name:'||o.academic_year_name END)
    =COALESCE(nb.year_id,no.academic_year_id,CASE WHEN no.operation_kind='TRAINING' OR length(trim(no.academic_year_name))=0 THEN 'offering:'||no.id ELSE 'name:'||no.academic_year_name END)
 ) THEN RAISE(ABORT,'An active enrollment already exists in this academic year') END;
END;

CREATE TRIGGER guard_enrollment_history_placement
BEFORE UPDATE OF student_id,batch_id,admission_id,enrolled_at ON academy_enrollments
WHEN NEW.student_id<>OLD.student_id OR NEW.batch_id<>OLD.batch_id OR NEW.admission_id<>OLD.admission_id OR NEW.enrolled_at<>OLD.enrolled_at
BEGIN SELECT RAISE(ABORT,'Historical enrollment placement is immutable; create a transfer record'); END;

CREATE TRIGGER guard_closed_enrollment_history
BEFORE UPDATE OF status ON academy_enrollments WHEN OLD.status<>'ACTIVE' AND NEW.status<>OLD.status
BEGIN SELECT RAISE(ABORT,'A closed enrollment remains historical'); END;

CREATE TRIGGER guard_student_merged_state
BEFORE UPDATE ON academy_students WHEN OLD.merged_into_id IS NOT NULL
BEGIN SELECT RAISE(ABORT,'Verified duplicate identity is archived; use its canonical student'); END;

CREATE TRIGGER guard_student_archive_evidence
BEFORE UPDATE OF merged_into_id,status ON academy_students
WHEN NEW.merged_into_id IS NOT NULL OR NEW.status='ARCHIVED'
BEGIN
 SELECT CASE WHEN NEW.status<>'ARCHIVED' OR NEW.merged_into_id IS NULL OR NOT EXISTS(
  SELECT 1 FROM academy_student_merges m WHERE m.source_id=NEW.id AND m.target_id=NEW.merged_into_id
 ) OR EXISTS(SELECT 1 FROM academy_enrollments e WHERE e.student_id=NEW.id AND e.status='ACTIVE')
  THEN RAISE(ABORT,'Verified duplicate resolution is required before archiving a Student ID') END;
END;

CREATE TRIGGER guard_student_merge_history_update BEFORE UPDATE ON academy_student_merges
BEGIN SELECT RAISE(ABORT,'Verified identity merge evidence is immutable'); END;

CREATE TRIGGER guard_student_merge_history_delete BEFORE DELETE ON academy_student_merges
BEGIN SELECT RAISE(ABORT,'Verified identity merge evidence is immutable'); END;

CREATE TRIGGER guard_student_transfer_history_update BEFORE UPDATE ON academy_enrollment_transfers
BEGIN SELECT RAISE(ABORT,'Enrollment transfer evidence is immutable'); END;

CREATE TRIGGER guard_student_transfer_history_delete BEFORE DELETE ON academy_enrollment_transfers
BEGIN SELECT RAISE(ABORT,'Enrollment transfer evidence is immutable'); END;

CREATE TRIGGER guard_assessment_grade_insert
BEFORE INSERT ON academy_assessment_results
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM academy_assessments a
    JOIN academy_enrollments e ON e.id=NEW.enrollment_id
    WHERE a.id=NEW.assessment_id AND a.batch_id=e.batch_id
      AND a.status='DRAFT' AND e.status='ACTIVE'
      AND date(e.enrolled_at)<=a.held_on AND a.held_on<=date('now')
      AND NEW.obtained_marks<=a.max_marks
  ) THEN RAISE(ABORT,'Assessment is not ready for grading') END;
END;

CREATE TRIGGER guard_assessment_grade_update
BEFORE UPDATE ON academy_assessment_results
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM academy_assessments a
    JOIN academy_enrollments e ON e.id=NEW.enrollment_id
    WHERE a.id=NEW.assessment_id AND a.batch_id=e.batch_id
      AND a.status='DRAFT' AND e.status='ACTIVE'
      AND date(e.enrolled_at)<=a.held_on AND a.held_on<=date('now')
      AND NEW.obtained_marks<=a.max_marks
  ) THEN RAISE(ABORT,'Assessment is not ready for grading') END;
END;

CREATE TRIGGER protect_source_fee_plan_terms
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

CREATE TRIGGER protect_source_fee_plan_state
BEFORE UPDATE ON academy_fee_plans
WHEN NEW.source_version IS NOT NULL AND
 (NEW.active<>CASE WHEN NEW.source_status='ACTIVE' THEN 1 ELSE 0 END
  OR (NEW.source_status='ACTIVE' AND NOT EXISTS(
    SELECT 1 FROM academy_fee_plan_components c WHERE c.plan_id=NEW.id
    AND c.charge_type='TUITION' AND c.recurrence='PER_CYCLE' AND c.amount_paisa>0))
  OR (NEW.source_status='ACTIVE' AND (NEW.monthly_amount_paisa<>(SELECT COALESCE(SUM(amount_paisa),0) FROM academy_fee_plan_components WHERE plan_id=NEW.id AND recurrence='PER_CYCLE')
    OR NEW.admission_amount_paisa<>(SELECT COALESCE(SUM(amount_paisa),0) FROM academy_fee_plan_components WHERE plan_id=NEW.id AND recurrence='ONE_TIME'))))
BEGIN SELECT RAISE(ABORT,'A source plan requires valid published components and consistent state'); END;

CREATE TRIGGER reject_legacy_plan_after_source_publish
BEFORE INSERT ON academy_fee_plans
WHEN NEW.source_version IS NULL AND EXISTS(
 SELECT 1 FROM academy_fee_plans p WHERE p.offering_id=NEW.offering_id AND p.source_version IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'Use the source Fee Plan workflow for this offering'); END;

CREATE TRIGGER reject_legacy_plan_reactivation
BEFORE UPDATE ON academy_fee_plans
WHEN NEW.source_version IS NULL AND NEW.active=1 AND EXISTS(
 SELECT 1 FROM academy_fee_plans p WHERE p.offering_id=NEW.offering_id AND p.source_version IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'Use the source Fee Plan workflow for this offering'); END;

CREATE TRIGGER protect_source_component_insert
BEFORE INSERT ON academy_fee_plan_components
WHEN NOT EXISTS(SELECT 1 FROM academy_fee_plans p WHERE p.id=NEW.plan_id AND p.source_status='DRAFT')
BEGIN SELECT RAISE(ABORT,'Published fee components cannot change'); END;

CREATE TRIGGER protect_source_component_update
BEFORE UPDATE ON academy_fee_plan_components
WHEN NOT EXISTS(SELECT 1 FROM academy_fee_plans p WHERE p.id=OLD.plan_id AND p.source_status='DRAFT')
 OR NOT EXISTS(SELECT 1 FROM academy_fee_plans p WHERE p.id=NEW.plan_id AND p.source_status='DRAFT')
BEGIN SELECT RAISE(ABORT,'Published fee components cannot change'); END;

CREATE TRIGGER protect_source_component_delete
BEFORE DELETE ON academy_fee_plan_components
WHEN NOT EXISTS(SELECT 1 FROM academy_fee_plans p WHERE p.id=OLD.plan_id AND p.source_status='DRAFT')
BEGIN SELECT RAISE(ABORT,'Published fee components cannot change'); END;

CREATE TRIGGER collection_promise_no_delete
 BEFORE DELETE ON finance_collection_promises
 BEGIN SELECT RAISE(ABORT,'Collection promises cannot be deleted'); END;

CREATE TRIGGER collection_promise_controlled_update
 BEFORE UPDATE ON finance_collection_promises
 WHEN OLD.status<>'OPEN' OR NEW.status NOT IN ('COMPLETED','CANCELLED')
 OR NEW.revision<>OLD.revision+1 OR NEW.id<>OLD.id OR NEW.invoice_id<>OLD.invoice_id
 OR NEW.amount_paisa<>OLD.amount_paisa OR NEW.due_on<>OLD.due_on
 OR NEW.baseline_paid_paisa<>OLD.baseline_paid_paisa
 OR NEW.reason<>OLD.reason OR NEW.actor_id<>OLD.actor_id OR NEW.created_at<>OLD.created_at
 BEGIN SELECT RAISE(ABORT,'Only a controlled promise closure is allowed'); END;

CREATE TRIGGER collection_event_no_update
 BEFORE UPDATE ON finance_collection_events
 BEGIN SELECT RAISE(ABORT,'Collection evidence is immutable'); END;

CREATE TRIGGER collection_event_no_delete
 BEFORE DELETE ON finance_collection_events
 BEGIN SELECT RAISE(ABORT,'Collection evidence is immutable'); END;

CREATE TRIGGER collection_key_no_update
 BEFORE UPDATE ON finance_collection_command_keys
 BEGIN SELECT RAISE(ABORT,'Collection request identity is immutable'); END;

CREATE TRIGGER collection_key_no_delete
 BEFORE DELETE ON finance_collection_command_keys
 BEGIN SELECT RAISE(ABORT,'Collection request identity is immutable'); END;

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

CREATE TRIGGER post_operating_expense_command
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

CREATE TRIGGER guard_expense_command_update
BEFORE UPDATE ON finance_expense_command_keys
BEGIN SELECT RAISE(ABORT,'Expense command evidence is immutable'); END;

CREATE TRIGGER guard_expense_command_delete
BEFORE DELETE ON finance_expense_command_keys
BEGIN SELECT RAISE(ABORT,'Expense command evidence is immutable'); END;

CREATE TRIGGER guard_posted_expense_update
BEFORE UPDATE ON finance_operating_expenses
BEGIN SELECT RAISE(ABORT,'Posted expense is immutable'); END;

CREATE TRIGGER guard_posted_expense_delete
BEFORE DELETE ON finance_operating_expenses
BEGIN SELECT RAISE(ABORT,'Posted expense is immutable'); END;
