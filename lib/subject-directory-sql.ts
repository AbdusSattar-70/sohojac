/**
 * Read-only subject directory SQL used by both the staff UI and disposable D1
 * regression tests. Global academic_subjects is the current canonical master.
 * academy_subjects and its offering links remain an immutable-identity
 * compatibility concern until the explicit, reviewed cutover phase.
 */
export const globalSubjectDirectorySql =
  "SELECT id,code,title AS name,active FROM academic_subjects ORDER BY active DESC,title,code,id";

export const legacySubjectUsageSql = [
  "SELECT s.id,s.code,s.name,s.class_grade AS classGrade,s.group_name AS groupName,s.active,",
  "COUNT(l.offering_id) AS linkedOfferings",
  "FROM academy_subjects s LEFT JOIN academy_offering_subjects l ON l.subject_id=s.id",
  "GROUP BY s.id,s.code,s.name,s.class_grade,s.group_name,s.active",
  "ORDER BY linkedOfferings DESC,s.name,s.class_grade,s.group_name,s.id",
].join(" ");

/**
 * C2b dependency inventory: each original offering/subject FK remains visible.
 * Public card JSON is checked by exact legacy ID, never guessed from a name.
 * This query has no LIMIT: a partial list cannot certify a cutover.
 */
export const legacyOfferingImpactSql = [
  "SELECT l.subject_id AS legacySubjectId,s.name AS legacyName,s.code AS legacyCode,",
  "s.class_grade AS classGrade,s.group_name AS groupName,",
  "l.offering_id AS offeringId,o.name AS offeringName,o.code AS offeringCode,",
  "o.show_on_website AS publicVisible,o.is_active AS offeringActive,",
  "CASE WHEN EXISTS (SELECT 1 FROM json_each(o.subjects_json) AS j",
  "WHERE json_extract(j.value,'$.id')=l.subject_id) THEN 1 ELSE 0 END AS snapshotContainsLegacyId",
  "FROM academy_offering_subjects l",
  "JOIN academy_subjects s ON s.id=l.subject_id",
  "JOIN public_programme_offerings o ON o.id=l.offering_id",
  "ORDER BY o.name,o.id,s.class_grade,s.name,s.id",
].join(" ");

/**
 * Assessments contain a free-text subject label and no subject ID.
 * Report exact stored labels; no title/name join is evidence of identity.
 */
export const assessmentSubjectLabelsSql = [
  "SELECT subject AS subjectLabel,COUNT(*) AS assessmentCount,",
  "COUNT(DISTINCT batch_id) AS affectedBatches,",
  "MIN(held_on) AS earliestDate,MAX(held_on) AS latestDate",
  "FROM academy_assessments GROUP BY subject",
  "ORDER BY assessmentCount DESC,subject",
].join(" ");

/** Sessions have a title/topic but no subject foreign key. */
export const teachingReferenceCountsSql = [
  "SELECT (SELECT COUNT(*) FROM academy_assessments) AS assessments,",
  "(SELECT COUNT(*) FROM academy_class_sessions) AS sessions",
].join(" ");
