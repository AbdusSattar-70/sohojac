import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { databaseTargets, requireDevelopmentDatabaseId } from "../lib/database-target.ts";
import { freshDevLegacyCleanupStatements, devReferenceSeedSql } from "./canonical-dev-bootstrap.mjs";

const root = new URL("../", import.meta.url);
const source = await readFile(new URL("scripts/seed-dev-reference.mjs", root), "utf8");
const migrations = await Promise.all((await readdir(new URL("migrations/history/", root)))
  .filter(name => /^\d{4}_.*\.sql$/.test(name)).sort()
  .map(name => readFile(new URL("migrations/history/" + name, root), "utf8")));
// Execute the actual release script, injecting only its imported dependencies,
// controlled process environment, and a local Cloudflare HTTP boundary.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const execute = new AsyncFunction(
  "fetch", "process", "console", "freshDevLegacyCleanupStatements", "devReferenceSeedSql",
  "databaseTargets", "requireDevelopmentDatabaseId",
  source.replace(/^import[^\n]*\n/gm, ""),
);
const devId = "11111111-1111-4111-8111-111111111111";
const actor = "bootstrap-owner";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for (const sql of migrations) db.exec(sql);
  db.prepare('INSERT INTO "user"(id,name,email,"createdAt","updatedAt") VALUES (?,?,?,0,0)')
    .run(actor, "Synthetic Owner", "bootstrap@example.invalid");
  db.prepare("INSERT INTO staff_memberships(user_id,role,active) VALUES (?,'OWNER',1)").run(actor);
  return db;
}
function snapshot(db) {
  return db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all().map(({ name }) => [name, db.prepare('SELECT * FROM "' + name + '"').all()]);
}
function enquiry(db) {
  db.prepare("INSERT INTO public_enquiries(id,reference,intent,student_name,class_name,guardian_name,mobile,consent_at) VALUES ('dev-enquiry','DEV-ENQUIRY','interest','Synthetic Prospect','Class 8','Synthetic Guardian','01700000000','2026-10-30')").run();
}
async function run(db, options = {}) {
  const queries = [], mutations = [], counts = [];
  let fetches = 0;
  const env = {
    CLOUDFLARE_ACCOUNT_ID: "local-test-account", CLOUDFLARE_API_TOKEN: "synthetic-test-token",
    GITHUB_REF: "refs/heads/dev", SOHOJAC_DEV_D1_ID: devId, SOHOJAC_D1_ID: devId,
    ...options.env,
  };
  const exit = Symbol("script exit");
  const response = (result) => Response.json({ success: true, result });
  const fetch = async (url, init = {}) => {
    fetches++;
    const base = "https://api.cloudflare.com/client/v4/accounts/local-test-account/d1/database/" + devId;
    if (url === base) return response(options.metadata ?? { uuid: devId, name: "sohojac_dev" });
    assert.equal(url, base + "/query", "Only the verified independent dev database can be queried");
    assert.equal(init.method, "POST");
    const { sql, params } = JSON.parse(init.body);
    assert.deepEqual(params, []);
    queries.push(sql);
    if (/^SELECT/.test(sql)) {
      const results = db.prepare(sql).all();
      if (sql.includes("other_offerings")) counts.push(results[0]);
      return response([{ success: true, results }]);
    }
    mutations.push(sql);
    db.exec("BEGIN");
    try { db.exec(sql); db.exec("COMMIT"); }
    catch (error) { db.exec("ROLLBACK"); throw error; }
    return response([{ success: true, results: [] }]);
  };
  let error;
  try {
    await execute(fetch, { env, exit(code) { assert.equal(code, 0); throw exit; } }, { log() {} },
      freshDevLegacyCleanupStatements, devReferenceSeedSql, databaseTargets, requireDevelopmentDatabaseId);
  } catch (caught) { if (caught !== exit) error = caught; }
  return { queries, mutations, counts, fetches, error };
}

for (const [name, populate, expected] of [
  ["CRM prospect without a student or payment", enquiry, ["public_enquiries", "academy_prospects"]],
  ["standalone operating expense and its journal", db => {
    db.prepare("INSERT INTO finance_operating_expenses(id,reference,category,payee,description,spent_on,amount_paisa,payment_method,approved_by) VALUES ('dev-expense','DEV-EXPENSE','RENT','Synthetic Supplier','Synthetic rent expense','2026-10-30',100,'CASH',?)").run(actor);
  }, ["finance_operating_expenses", "finance_journals", "finance_journal_lines"]],
  ["draft accounting journal without students or payments", db => {
    db.prepare("INSERT INTO finance_journals(id,reference,description,posted_by) VALUES ('dev-journal','DEV-JOURNAL','Operator draft journal',?)").run(actor);
  }, ["finance_journals"]],
  ["student command history without a current student", db => {
    db.prepare("INSERT INTO academy_student_command_keys(request_id,actor_id,payload_json,result_id,result_json) VALUES ('dev-command',?,'{}','historical-student','{}')").run(actor);
  }, ["academy_student_command_keys"]],
  ["reserved permanent student identity", db => {
    db.exec("INSERT INTO academy_student_number_sequence(admission_id) VALUES ('historical-admission')");
  }, ["academy_student_number_sequence"]],
  ["invoice in the canonical student ledger", db => {
    db.exec("INSERT INTO academy_students(id,student_no,full_name,guardian_name,guardian_mobile) VALUES ('dev-student','SA-000001','Synthetic Student','Synthetic Guardian','01700000000')");
    db.prepare("INSERT INTO finance_invoices(id,invoice_no,student_id,issue_on,amount_paisa,created_by) VALUES ('dev-invoice','DEV-INVOICE','dev-student','2026-10-30',100,?)").run(actor);
  }, ["academy_students", "finance_invoices"]],
]) {
  test("fresh bootstrap refuses " + name + " before deleting any legacy fixture", async () => {
    const db = fixture();
    try {
      populate(db);
      const before = snapshot(db);
      const result = await run(db);
      assert.match(result.error?.message ?? "", /contains business records/);
      assert.equal(result.mutations.length, 0);
      assert.equal(result.counts.length, 1);
      for (const table of expected) assert(result.counts[0][table] > 0, table);
      assert.deepEqual(snapshot(db), before);
      assert.equal(db.prepare("SELECT count(*) n FROM public_programme_offerings WHERE id IN ('sa-annual-2026','sa-ssc-science')").get().n, 2);
    } finally { db.close(); }
  });
}

test("verified fresh dev permits existing auth, staff and reference edits, then completes canonical references once", async () => {
  const db = fixture();
  try {
    db.exec("INSERT INTO academy_classes(id,code,name,sort_order) VALUES ('operator-class-one','CLASS1','Operator Class One',1)");
    const staff = db.prepare("SELECT * FROM academy_staff").all();
    const result = await run(db);
    assert.equal(result.error, undefined);
    assert.deepEqual(result.mutations.slice(0, 3), freshDevLegacyCleanupStatements);
    assert.equal(result.mutations.length, 5);
    assert.equal(db.prepare("SELECT name FROM academy_classes WHERE code='CLASS1'").get().name, "Operator Class One");
    assert.deepEqual(db.prepare("SELECT * FROM academy_staff").all(), staff);
    assert.equal(db.prepare('SELECT count(*) n FROM "user"').get().n, 1);
    assert.equal(db.prepare("SELECT count(*) n FROM academy_classes").get().n, 12);
    assert.equal(db.prepare("SELECT count(*) n FROM academy_guardian_relationships").get().n, 27);
    assert.equal(db.prepare("SELECT count(*) n FROM academy_subjects").get().n, 0);
    assert.equal(db.prepare("SELECT count(*) n FROM public_programme_offerings").get().n, 0);
    assert.equal(db.prepare("SELECT status FROM system_maintenance_operations WHERE id='dev-reference-seed-v1'").get().status, "COMPLETE");
    assert.equal(db.prepare("SELECT count(*) n FROM system_maintenance_operations WHERE id='foundation-reset-20261030-v1'").get().n, 0);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { db.close(); }
});

test("a completed dev seed preserves subsequent business data and operator edits without cleanup or reseeding", async () => {
  const db = fixture();
  try {
    assert.equal((await run(db)).error, undefined);
    enquiry(db);
    db.exec("UPDATE academy_classes SET name='Accepted operator edit' WHERE code='CLASS1'");
    const before = snapshot(db);
    const result = await run(db);
    assert.equal(result.error, undefined);
    assert.equal(result.mutations.length, 0);
    assert.equal(result.counts.length, 0);
    assert.equal(result.queries.length, 1);
    assert.deepEqual(snapshot(db), before);
  } finally { db.close(); }
});

for (const [name, options] of [
  ["production branch", { env: { GITHUB_REF: "refs/heads/master" } }],
  ["production database ID", { env: { SOHOJAC_DEV_D1_ID: databaseTargets.production.id, SOHOJAC_D1_ID: databaseTargets.production.id } }],
  ["mismatched database IDs", { env: { SOHOJAC_D1_ID: databaseTargets.production.id } }],
  ["missing Cloudflare token", { env: { CLOUDFLARE_API_TOKEN: "" } }],
  ["unexpected database name", { metadata: { uuid: devId, name: "sohojac" } }],
  ["unexpected database UUID", { metadata: { uuid: databaseTargets.production.id, name: "sohojac_dev" } }],
]) {
  test("dev bootstrap refuses " + name + " before any SQL", async () => {
    const db = fixture();
    try {
      const before = snapshot(db);
      const result = await run(db, options);
      assert(result.error);
      assert.equal(result.queries.length, 0);
      assert.equal(result.mutations.length, 0);
      assert.deepEqual(snapshot(db), before);
    } finally { db.close(); }
  });
}
