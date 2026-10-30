import { freshDevLegacyCleanupStatements, devReferenceSeedSql } from "./canonical-dev-bootstrap.mjs";
import { databaseTargets, requireDevelopmentDatabaseId } from "../lib/database-target.ts";

const { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token, GITHUB_REF: ref } = process.env;
if (ref !== databaseTargets.development.branch || !account || !token)
  throw Error("Only a dev release may run development reference seeds.");
const id = requireDevelopmentDatabaseId(process.env.SOHOJAC_DEV_D1_ID);
if (process.env.SOHOJAC_D1_ID !== id) throw Error("Development seed database mismatch.");
const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/d1/database/${encodeURIComponent(id)}`;
async function cloudflare(route, body) {
  const res = await fetch(base + route, {
    method: body ? "POST" : "GET",
    headers: { Authorization: "Bearer " + token, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.success !== true || (Array.isArray(json.result) && json.result.some(x => x.success === false)))
    throw Error("Development D1 API verification/seed failed (HTTP " + res.status + ").");
  return json.result;
}
const db = await cloudflare("");
if (db?.uuid !== id || db?.name !== databaseTargets.development.name)
  throw Error("Dev seed target is not the isolated sohojac_dev database.");
const query = async (sql) => cloudflare("/query", { sql, params: [] });
const current = (await query("SELECT status FROM system_maintenance_operations WHERE id='dev-reference-seed-v1'"))[0].results[0];
if (current?.status === "COMPLETE") {
  console.log("Dev reference catalogue already initialized; preserving developer changes.");
  process.exit(0);
}
// Historical schema migrations include two 2026 marketing showcase rows and
// four grade-specific subject examples. Retire only those exact legacy fixtures
// while bootstrapping a brand-new DEV D1, never on production or a used DB.
const baseline = (await query("SELECT (SELECT count(*) FROM public_programme_offerings WHERE id NOT IN ('sa-annual-2026','sa-ssc-science')) other_offerings,(SELECT count(*) FROM academy_students) students,(SELECT count(*) FROM academy_admissions) admissions,(SELECT count(*) FROM academy_batches) batches,(SELECT count(*) FROM academy_fee_plans) fee_plans,(SELECT count(*) FROM finance_payments) payments"))[0].results[0];
if (Object.values(baseline).some(value => value !== 0))
  throw Error("Refusing fresh dev bootstrap because the target contains business records. Never reset a populated database.");
for (const sql of freshDevLegacyCleanupStatements) await query(sql);
const sql = devReferenceSeedSql();
if (/\bDELETE\s+FROM\b|\bDROP\s+(?:TABLE|TRIGGER|INDEX)\b|\bTRUNCATE\b/i.test(sql))
  throw Error("Dev reference seed must be strictly additive.");
await query(sql);
const row = (await query("SELECT (SELECT count(*) FROM academy_classes) classes,(SELECT count(*) FROM academy_guardian_relationships) relationships,(SELECT count(*) FROM academic_subjects) subjects,(SELECT count(*) FROM academy_subjects) legacy_grade_subjects,(SELECT count(*) FROM academy_students) students,(SELECT count(*) FROM finance_payments) payments,(SELECT count(*) FROM public_programme_offerings) offerings"))[0].results[0];
if (row.classes < 12 || row.relationships < 27 || row.subjects < 20 ||
    row.legacy_grade_subjects !== 0 || row.students !== 0 || row.payments !== 0 || row.offerings !== 0)
  throw Error("Fresh-development reference validation failed; no completion marker written.");
await query("INSERT INTO system_maintenance_operations(id,status,manifest_json,completed_at) VALUES ('dev-reference-seed-v1','COMPLETE','{}',strftime('%Y-%m-%dT%H:%M:%fZ','now'))");
console.log("New dev D1 seeded with Classes 1–12, guardian relationships and one global subject master; no people or financial records.");
