import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test, beforeEach, after } from "node:test";
import { freshDevBootstrapSql } from "./canonical-dev-bootstrap.mjs";
import { seedPublicCatalogue } from "./public-catalogue-seed.mjs";
import { historicalPublicCataloguePrerequisiteSql } from "./fixtures/historical-public-catalogue.mjs";
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
  db.exec("BEGIN");
  try {
    db.exec(freshDevBootstrapSql());
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
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
  db.exec(historicalPublicCataloguePrerequisiteSql);
  assert.equal((await seedPublicCatalogue(query)).applied, true);
  assert.equal(n("public_programme_offerings"), 3);
  assert.equal(n("academy_batches"), 3);
  assert.deepEqual(
    db.prepare(
      "SELECT o.code,count(s.subject_id) n FROM public_programme_offerings o LEFT JOIN academy_offering_subjects s ON s.offering_id=o.id GROUP BY o.code ORDER BY o.code",
    ).all().map(({ code, n }) => [code, n]),
    [["BEC10-2026", 8], ["BEC8-2026", 5], ["BEC9-2026", 8]],
  );
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
  db.exec(historicalPublicCataloguePrerequisiteSql);
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
  db.exec(historicalPublicCataloguePrerequisiteSql);
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

test("fresh dev reference bootstrap has no historical reset marker and cannot run the historical catalogue seed", async () => {
  assert.equal(
    db.prepare(
      "SELECT count(*) n FROM system_maintenance_operations WHERE id='foundation-reset-20261030-v1'",
    ).get().n,
    0,
  );
  await assert.rejects(
    seedPublicCatalogue(query),
    /completed foundation reset; fresh development uses the separate reference seed/,
  );
  for (const table of [
    "public_programme_offerings",
    "academy_batches",
    "academy_fee_plans",
    "academy_subjects",
    "erp_audit_events",
  ])
    assert.equal(n(table), 0, table);
  assert.equal(n("system_maintenance_operations"), 0);
});
test("historical catalogue rejects an inactive owner before creating business records", async () => {
  db.exec(historicalPublicCataloguePrerequisiteSql);
  db.exec("UPDATE staff_memberships SET active=0");
  await assert.rejects(seedPublicCatalogue(query), /requires an active owner/);
  for (const table of [
    "public_programme_offerings",
    "academy_batches",
    "academy_fee_plans",
    "erp_audit_events",
  ])
    assert.equal(n(table), 0, table);
});

