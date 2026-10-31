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
