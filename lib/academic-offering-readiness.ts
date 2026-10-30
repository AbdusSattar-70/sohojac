/** Shared by batch choices, server validation and the guarded insert. SQL alias: o. */
export const batchOfferingReadySql = [
  "o.is_active=1 AND COALESCE(o.offering_status,'ACTIVE')='ACTIVE'",
  "AND EXISTS(SELECT 1 FROM academy_branches b WHERE b.id=o.branch_id AND b.is_active=1)",
  "AND EXISTS(SELECT 1 FROM academy_programmes p WHERE p.id=o.program_id AND p.active=1)",
  "AND o.operation_kind IN ('SCHOOL','COACHING','TRAINING')",
  "AND (o.operation_kind='TRAINING' OR (o.academic_year_id IS NOT NULL AND EXISTS(SELECT 1 FROM academy_classes c WHERE c.id=o.class_id AND c.is_active=1)))",
  "AND (o.academic_year_id IS NULL OR EXISTS(SELECT 1 FROM academic_years y WHERE y.id=o.academic_year_id AND y.status!='CLOSED'))",
  "AND EXISTS(SELECT 1 FROM academy_fee_plans f WHERE f.offering_id=o.id AND f.active=1",
  "AND (f.source_version IS NULL OR (f.source_status='ACTIVE' AND f.effective_from<=date('now','+6 hours') AND (f.effective_to IS NULL OR f.effective_to>=date('now','+6 hours')))))",
].join(" ");
