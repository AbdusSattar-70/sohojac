import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Squashes the historical D1 migration graph into the real final SQLite schema.
 * This is a developer build tool ONLY. No Cloudflare credentials or remote D1 writes.
 *
 * Usage: node scripts/generate-canonical-migrations.mjs [source-dir] [destination-dir]
 *
 * The canonical baseline contains no history-only student snapshots or 2026
 * showcase programme / linked subject records. The global subject and school
 * references remain a separate idempotent seed; finance chart reference accounts
 * are the only migrated baseline data.
 */
const sourceDir = process.argv[2] || "migrations/history";
const destination = process.argv[3] || "migrations";
const names = readdirSync(sourceDir).filter(n => /^\d{4}_[a-z0-9_-]+\.sql$/.test(n)).sort();
if (names.length !== 36 || names.at(0) !== "0001_public_website.sql" ||
    names.at(-1) !== "0037_operator_expense_commands.sql") {
  throw Error("Expected the verified 36 historical migration files, not an incomplete or changed history.");
}
const db = new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys=ON");
for (const name of names) db.exec(readFileSync(join(sourceDir, name), "utf8"));
const fk = db.prepare("PRAGMA foreign_key_check").all();
if (fk.length !== 0) throw Error("Historical schema has invalid foreign keys.");
const all = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all();
const isSnapshot = name => /_pre_0029$/.test(name);
const objects = all.filter(o => !isSnapshot(o.name) && !isSnapshot(o.tbl_name));
const kind = type => objects.filter(x => x.type === type);
const tables = kind("table"), indexes = kind("index"), triggers = kind("trigger"), views = kind("view");
if (tables.length < 30 || triggers.length < 15 || indexes.length < 10) {
  throw Error("Baseline object counts unexpectedly low. Inspect original migration graph.");
}
const q = s => "'" + String(s).replaceAll("'", "''") + "'";
const accounts = db.prepare("SELECT id,code,name,kind FROM finance_accounts ORDER BY code").all();
if (accounts.length < 5) throw Error("Required finance chart of accounts is incomplete.");
const headers = [
  "-- Canonical operator-first development baseline: final current tables.\n-- Fresh schema only; NO historical ALTER/DROP/rebuild or sample business records.\n",
  "-- Final explicit indexes / uniqueness from verified source schema.\n",
  "-- Final domain guards and business triggers. No migration-only snapshot guards.\n",
  "-- Genuine accounting reference accounts only; NO invoices/payments/students or marketing examples.\n",
];
const files = {
  "0001_schema_tables.sql": headers[0] + tables.map(o => o.sql + ";").join("\n\n") + "\n",
  "0002_schema_indexes.sql": headers[1] + indexes.map(o => o.sql + ";").join("\n\n") + "\n",
  "0003_domain_guards.sql": headers[2] + [...views, ...triggers].map(o => o.sql + ";").join("\n\n") + "\n",
  "0004_finance_reference.sql": headers[3] +
    accounts.map(x => "INSERT INTO finance_accounts(id,code,name,kind) VALUES (" +
      [x.id, x.code, x.name, x.kind].map(q).join(",") + ");").join("\n") + "\n",
};
// Validate every DDL statement in a genuinely empty database, not by string comparison alone.
const fresh = new DatabaseSync(":memory:");
fresh.exec("PRAGMA foreign_keys=ON");
for (const sql of Object.values(files)) fresh.exec(sql);
const check = fresh.prepare("SELECT type,name,tbl_name FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
const expected = objects.map(({type,name,tbl_name}) => ({type,name,tbl_name})).sort((a,b)=>a.type.localeCompare(b.type)||a.name.localeCompare(b.name));
const actual = check.sort((a,b)=>a.type.localeCompare(b.type)||a.name.localeCompare(b.name));
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  const missing = expected.filter(x=>!actual.some(y=>y.type===x.type&&y.name===x.name));
  const extra = actual.filter(x=>!expected.some(y=>y.type===x.type&&y.name===x.name));
  throw Error("Canonical snapshot differs from final historic schema: " + JSON.stringify({missing, extra}));
}
if (fresh.prepare("PRAGMA foreign_key_check").all().length) throw Error("Invalid canonical foreign keys");
if (fresh.prepare("SELECT count(*) AS n FROM finance_accounts").get().n !== accounts.length) throw Error("Reference accounts mismatch");
for (const table of ["public_programme_offerings","academy_students","academy_admissions","finance_invoices","finance_payments","finance_operating_expenses"]) {
  if (fresh.prepare("SELECT count(*) AS n FROM " + table).get().n !== 0)
    throw Error("Fresh database must not have business data in " + table);
}
if (fresh.prepare("SELECT count(*) AS n FROM academy_subjects").get().n !== 0) throw Error("No duplicate class-based subjects in baseline.");
mkdirSync(destination, {recursive:true});
for (const [name,sql] of Object.entries(files)) writeFileSync(join(destination,name),sql);
const report = {sourceMigrations:names.length, canonicalFiles:Object.keys(files).length,
  tables:tables.length,indexes:indexes.length,triggers:triggers.length,views:views.length,accounts:accounts.length,
  canonicalBytes:Object.values(files).reduce((a,s)=>a+s.length,0)};
console.log("Canonical baseline generated and validated:",JSON.stringify(report));
if (process.env.EMIT_CANONICAL_TO_LOGS === "1") {
  // Keep each log line short enough to survive GitHub Actions log limits.
  for (const [name,sql] of Object.entries(files)) {
    const chunkSize = 1800, count = Math.ceil(sql.length / chunkSize);
    for (let i=0;i<count;i++)
      console.log("CANONICAL_CHUNK " + name + " " + (i+1) + "/" + count + " " +
        JSON.stringify(sql.slice(i*chunkSize,(i+1)*chunkSize)));
  }
}
db.close();fresh.close();
