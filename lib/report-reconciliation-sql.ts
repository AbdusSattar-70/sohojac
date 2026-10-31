/**
 * C5a ledger reconciliations. Aggregate ALL rows, not a truncated transaction page.
 * A globally balanced ledger can hide two offsetting broken journals, so inspect
 * each posted journal independently.
 */
export const reportReconciliationSql={
 postedJournalCount:"SELECT COUNT(*) AS total FROM finance_journals WHERE status='POSTED'",
 unbalancedPostedJournals:[
  "SELECT COUNT(*) AS total FROM (",
  "SELECT j.id FROM finance_journals j LEFT JOIN finance_journal_lines l ON l.journal_id=j.id",
  "WHERE j.status='POSTED' GROUP BY j.id",
  "HAVING COALESCE(SUM(l.debit_paisa),0)<>COALESCE(SUM(l.credit_paisa),0)",
  "OR COUNT(l.id)=0)",
 ].join(" "),
 unallocatedReceipts:[
  "SELECT COUNT(*) AS total FROM (",
  "SELECT p.id FROM finance_payments p LEFT JOIN finance_allocations a ON a.payment_id=p.id",
  "GROUP BY p.id HAVING COALESCE(SUM(a.amount_paisa),0)<>p.amount_paisa)",
 ].join(" "),
 paymentMethods:[
  "SELECT payment_method AS method,COUNT(*) AS receipts,",
  "COALESCE(SUM(amount_paisa),0) AS amountPaisa",
  "FROM finance_payments WHERE substr(received_at,1,7)=?",
  "GROUP BY payment_method ORDER BY payment_method",
 ].join(" "),
} as const;
