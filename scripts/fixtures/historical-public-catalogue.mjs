/**
 * Synthetic prerequisite for the historical public-catalogue regression only.
 * Execute only in disposable SQLite/Miniflare tests, never in a remote seed.
 * Fresh dev bootstrap deliberately does not claim the production reset occurred.
 */
const commonSubjects = [
  ["BAN", "Bangla"],
  ["ENG", "English"],
  ["MAT", "Mathematics"],
  ["SCI", "General Science"],
  ["ICT", "ICT"],
];
export const historicalPublicCataloguePrerequisiteSql = [
  ...[8, 9, 10].flatMap((grade) =>
    commonSubjects.map(
      ([code, name]) =>
        `INSERT INTO academy_subjects(id,code,name,class_grade,group_name) VALUES ('local-catalogue-${grade}-${code}','${code}','${name}',${grade},'GENERAL')`,
    ),
  ),
  "INSERT INTO system_maintenance_operations(id,status,manifest_json,completed_at) VALUES ('foundation-reset-20261030-v1','COMPLETE','{\"fixture\":true,\"scope\":\"local-regression\"}',strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
].join(";\n");

