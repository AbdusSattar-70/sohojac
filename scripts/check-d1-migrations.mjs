/** Fail closed on potentially destructive production SQL migrations.
 * All legitimate future non-additive changes need an explicit review and
 * a separate audited migration plan, not a background push deploy.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const folder = "migrations";
const files = readdirSync(folder).filter(f => /^[0-9]{4}_[a-z0-9_-]+\.sql$/.test(f)).sort();
if (files.length === 0) throw new Error("Missing versioned D1 migrations");
const forbidden = [
  /\bDROP\s+(?:TABLE|INDEX|VIEW|TRIGGER|COLUMN)\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bTRUNCATE\b/i,
  /\bALTER\s+TABLE[\s\S]*?\bDROP\b/i,
  /\bREPLACE\s+INTO\b/i,
  /\bPRAGMA\s+foreign_keys\s*=\s*(?:OFF|0)\b/i,
  /\bVACUUM\b/i,
  /\bUPDATE\s+(?:"?user"?|"?account"?|"?staff_memberships"?)\s+SET\b/i,
];
for (const file of files) {
  const raw = readFileSync(join(folder, file), "utf8");
  // Reviewed canonical-table rebuild: exact bytes, immutable snapshots, full
  // bidirectional preservation assertions and FK checks. No general DROP exception.
  if (file === "0029_student_lifecycle.sql") {
    if (createHash("sha256").update(raw).digest("hex") !== "9f7796f6ca25a07e20d1d8f44fc9f842fb8a55756fd78f7593d9bc4f384d6436")
      throw new Error("Student lifecycle migration differs from the reviewed preservation plan");
    continue;
  }
  const sql = raw
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  // Reviewed schema-only parity correction: dropping this particular
  // uniqueness index does not delete records or make user data public.
  // Keep every other DROP forbidden; do not edit already applied migrations.
  const reviewed = file === "0022_multiple_active_academic_years.sql"
    ? sql.replace(/\bDROP\s+INDEX\s+IF\s+EXISTS\s+idx_one_active_academic_year\s*;/gi, "")
    : sql;
  for (const rule of forbidden) {
    if (rule.test(reviewed)) throw new Error(`Migration ${file} requires manual security review: disallowed SQL statement`);
  }
}
console.log(`Checked ${files.length} non-destructive D1 migration file(s).`);
