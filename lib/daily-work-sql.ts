/**
 * All-record work-queue counts, not a clipped "latest 200" table.
 * Dates use the academy's Dhaka operating day (UTC+06).
 * Consumers enforce their own named permissions before running any query.
 */
export const dailyWorkSql = {
  enquiries: "SELECT COUNT(*) AS n FROM public_enquiries WHERE status='NEW'",
  followups: [
    "SELECT COUNT(*) AS n FROM academy_prospects",
    "WHERE next_follow_up_at IS NOT NULL",
    "AND date(next_follow_up_at)<=date('now','+6 hours')",
    "AND status NOT IN ('CONVERTED','LOST','LEGACY_CLOSED')",
  ].join(" "),
  admissions: "SELECT COUNT(*) AS n FROM academy_admissions WHERE status IN ('DRAFT','REVIEW','ACCEPTED','BILLED')",
  overdueInvoices: [
    "SELECT COUNT(*) AS n FROM finance_invoices",
    "WHERE amount_paisa>paid_paisa AND status IN ('ISSUED','PARTIAL')",
    "AND due_on IS NOT NULL AND due_on<=date('now','+6 hours')",
  ].join(" "),
  sessionsToday: [
    "SELECT COUNT(*) AS n FROM academy_class_sessions s",
    "WHERE s.class_on=date('now','+6 hours') AND s.status IN ('SCHEDULED','HELD')",
  ].join(" "),
  teacherSessionsToday: [
    "SELECT COUNT(*) AS n FROM academy_class_sessions s",
    "WHERE s.class_on=date('now','+6 hours') AND s.status IN ('SCHEDULED','HELD')",
    "AND (s.teacher_id=? OR EXISTS (SELECT 1 FROM academy_batch_teachers bt",
    "WHERE bt.batch_id=s.batch_id AND bt.teacher_user_id=? AND bt.active=1))",
  ].join(" "),
  nearCapacityBatches: [
    "SELECT COUNT(*) AS n FROM academy_batches b WHERE b.status='ACTIVE'",
    "AND (SELECT COUNT(*) FROM academy_enrollments e",
    "WHERE e.batch_id=b.id AND e.status='ACTIVE')>=b.capacity-2",
  ].join(" "),
} as const;
