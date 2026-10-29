/** Fail closed on potentially destructive production SQL migrations.
 * All legitimate future non-additive changes need an explicit review and
 * a separate audited migration plan, not a background push deploy.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
  const sql = readFileSync(join(folder, file), "utf8")
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  for (const rule of forbidden) {
    if (rule.test(sql)) throw new Error(`Migration ${file} requires manual security review: disallowed SQL statement`);
  }
}
console.log(`Checked ${files.length} non-destructive D1 migration file(s).`);
