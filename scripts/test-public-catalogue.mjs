import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test, beforeEach, after } from "node:test";
import { resetPlan, operationId } from "./foundation-reset-plan.mjs";
import { seedPublicCatalogue } from "./public-catalogue-seed.mjs";
let db;
beforeEach(() => {
  db?.close();
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for (const f of fs
    .readdirSync("migrations")
    .filter((f) => /^\d{4}.*sql$/.test(f))
    .sort())
    db.exec(fs.readFileSync("migrations/" + f, "utf8"));
  db.exec(
    `INSERT INTO "user"(id,name,email,"createdAt","updatedAt") VALUES ('owner','Existing Owner','owner@example.invalid',0,0); INSERT INTO staff_memberships(user_id,role,active) VALUES ('owner','OWNER',1);`,
  );
  const schema = db
    .prepare(
      "SELECT type,name,sql FROM sqlite_schema WHERE type IN ('table','trigger')",
    )
    .all();
  db.prepare(
    "INSERT INTO system_maintenance_operations(id,status,manifest_json) VALUES (?,'PREPARED','[]')",
  ).run(operationId);
  db.exec("BEGIN");
  db.exec(resetPlan(schema, fs.readFileSync("seeds/foundation.sql", "utf8")));
  db.exec("COMMIT");
});
after(() => db?.close());
async function query(sql) {
  if (/^SELECT/.test(sql))
    return [{ success: true, results: db.prepare(sql).all() }];
  db.exec("BEGIN");
  try {
    db.exec(sql);
    db.exec("COMMIT");
    return [{ success: true, results: [] }];
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
const n = (t) => db.prepare("SELECT count(*) n FROM " + t).get().n;
test("requested catalogue has three public current-fee offerings and genuine 12-seat batches without people or transactions", async () => {
  assert.equal((await seedPublicCatalogue(query)).applied, true);
  assert.equal(n("public_programme_offerings"), 3);
  assert.equal(n("academy_batches"), 3);
  assert.deepEqual(
    db
      .prepare(
        "SELECT monthly_amount_paisa FROM academy_fee_plans ORDER BY monthly_amount_paisa",
      )
      .all()
      .map((x) => x.monthly_amount_paisa),
    [250000, 300000, 300000],
  );
  assert.equal(
    db
      .prepare(
        "SELECT count(*) n FROM academy_batches WHERE capacity=12 AND status='ACTIVE'",
      )
      .get().n,
    3,
  );
  for (const t of [
    "academy_students",
    "academy_admissions",
    "finance_invoices",
    "finance_payments",
    "finance_journals",
  ])
    assert.equal(n(t), 0);
  assert.equal(
    db.prepare("SELECT count(*) n FROM pragma_foreign_key_check").get().n,
    0,
  );
});
test("later seed executions preserve operator edits and do not duplicate or republish offerings", async () => {
  await seedPublicCatalogue(query);
  db.exec(
    "UPDATE public_programme_offerings SET name='Operator title',show_on_website=0 WHERE code='BEC8-2026'",
  );
  assert.equal((await seedPublicCatalogue(query)).applied, false);
  assert.equal(n("academy_batches"), 3);
  assert.equal(
    db
      .prepare(
        "SELECT name FROM public_programme_offerings WHERE code='BEC8-2026'",
      )
      .get().name,
    "Operator title",
  );
  assert.equal(
    db
      .prepare(
        "SELECT show_on_website FROM public_programme_offerings WHERE code='BEC8-2026'",
      )
      .get().show_on_website,
    0,
  );
});
test("missing master context rolls back the complete seed and leaves no completion marker", async () => {
  db.exec("DELETE FROM academy_classes WHERE code='CLASS8'");
  await assert.rejects(seedPublicCatalogue(query));
  assert.equal(n("academy_batches"), 0);
  assert.equal(n("public_programme_offerings"), 0);
  assert.equal(
    db
      .prepare(
        "SELECT count(*) n FROM system_maintenance_operations WHERE id='public-catalogue-20261030-v1'",
      )
      .get().n,
    0,
  );
});
