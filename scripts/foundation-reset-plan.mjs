// Reset domain data only. Authentication, staff identities and migration history survive.
export const operationId = "foundation-reset-20261030-v1";
const preserved = new Set([
  "user",
  "account",
  "session",
  "verification",
  "staff_memberships",
  "academy_staff",
  "erp_permission_grants",
  "staff_owner_setup",
  "d1_migrations",
  "system_maintenance_operations",
]);
export const quoteIdentifier = (value) =>
  '"' + value.replaceAll('"', '""') + '"';
export function resetPlan(schema, seed) {
  const tables = schema.filter(
    (x) =>
      x.type === "table" &&
      !preserved.has(x.name) &&
      !/^(sqlite_|_cf_)/.test(x.name),
  );
  const triggers = schema.filter((x) => x.type === "trigger" && x.sql);
  return [
    "PRAGMA defer_foreign_keys=ON;",
    ...triggers.map(
      (x) => `DROP TRIGGER IF EXISTS ${quoteIdentifier(x.name)};`,
    ),
    ...tables.map((x) => `DELETE FROM ${quoteIdentifier(x.name)};`),
    ...triggers.map((x) => x.sql + ";"),
    seed,
    "SELECT CASE WHEN (SELECT count(*) FROM academy_classes)=12 AND (SELECT count(*) FROM academy_guardian_relationships)=27 AND NOT EXISTS(SELECT 1 FROM academy_students) AND NOT EXISTS(SELECT 1 FROM finance_payments) THEN 1 ELSE json('Foundation validation failed') END;",
    `SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check) THEN 1 ELSE json('Foreign key check failed') END;`,
    `UPDATE system_maintenance_operations SET status='COMPLETE',completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='${operationId}';`,
    "PRAGMA defer_foreign_keys=OFF;",
  ].join("\n");
}
