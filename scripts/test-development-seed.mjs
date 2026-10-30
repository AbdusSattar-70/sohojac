import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test, beforeEach, after } from "node:test";
import { resetPlan, operationId } from "./foundation-reset-plan.mjs";
let db;
const seed = fs.readFileSync("seeds/foundation.sql", "utf8");
beforeEach(() => {
  db?.close();
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for (const f of fs
    .readdirSync("migrations")
    .filter((f) => /^\d{4}.*sql$/.test(f))
    .sort())
    db.exec(fs.readFileSync("migrations/" + f, "utf8"));
});
after(() => db?.close());
const n = (table) => db.prepare("SELECT COUNT(*) n FROM " + table).get().n;
function reset() {
  const schema = db
    .prepare(
      "SELECT type,name,sql FROM sqlite_schema WHERE type IN ('table','trigger')",
    )
    .all();
  db.prepare(
    "INSERT INTO system_maintenance_operations(id,status,manifest_json) VALUES (?,'PREPARED',?)",
  ).run(operationId, JSON.stringify(schema));
  db.exec("BEGIN");
  try {
    db.exec(resetPlan(schema, seed));
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
test("reset removes business data, preserves administrator and restores every trigger", () => {
  db.exec(
    `INSERT INTO "user"(id,name,email,"createdAt","updatedAt") VALUES ('owner','Existing Owner','owner@example.invalid',0,0); INSERT INTO staff_memberships(user_id,role,active) VALUES ('owner','OWNER',1);`,
  );
  const triggers = n("sqlite_schema");
  const triggerNames = db
    .prepare(
      "SELECT name FROM sqlite_schema WHERE type='trigger' ORDER BY name",
    )
    .all();
  reset();
  assert.equal(n("user"), 1);
  assert.equal(n("academy_staff"), 1);
  assert.deepEqual(
    db
      .prepare(
        "SELECT name FROM sqlite_schema WHERE type='trigger' ORDER BY name",
      )
      .all(),
    triggerNames,
  );
  for (const t of [
    "academy_students",
    "academy_admissions",
    "academy_prospects",
    "finance_payments",
    "finance_journals",
    "public_programme_offerings",
  ])
    assert.equal(n(t), 0);
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM pragma_foreign_key_check").get().n,
    0,
  );
});
test("reference data covers all twelve grades and diverse guardian relationships without demo records", () => {
  reset();
  assert.deepEqual(
    db
      .prepare("SELECT name FROM academy_classes ORDER BY sort_order")
      .all()
      .map((x) => x.name),
    Array.from({ length: 12 }, (_, i) => "Class " + (i + 1)),
  );
  for (const name of [
    "Father",
    "Mother",
    "Legal guardian",
    "Maternal uncle",
    "Other",
  ])
    assert.ok(
      db
        .prepare("SELECT id FROM academy_guardian_relationships WHERE name=?")
        .get(name),
    );
  assert.ok(n("academy_guardian_relationships") >= 25);
  assert.ok(n("academic_subjects") >= 20);
  assert.ok(!seed.includes("TEST"));
});
test("reference seed is repeatable and preserves operator edits", () => {
  reset();
  db.exec("UPDATE academy_classes SET name='Grade One' WHERE code='CLASS1'");
  db.exec(seed);
  assert.equal(n("academy_classes"), 12);
  assert.equal(
    db.prepare("SELECT name FROM academy_classes WHERE code='CLASS1'").get()
      .name,
    "Grade One",
  );
});
const source = fs
  .readFileSync("scripts/retire-legacy-dev-database.mjs", "utf8")
  .replace(/^import .*;\r?\n/gm, "");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
async function retirement({ binding = "shared", legacy = true } = {}) {
  const calls = [],
    writes = [];
  const sharedD1 = { id: "d6f3e4e9-2190-43bf-bc90-969687f6db78" };
  const fakeProcess = {
    env: {
      CLOUDFLARE_ACCOUNT_ID: "account",
      CLOUDFLARE_API_TOKEN: "synthetic",
      GITHUB_REF: "refs/heads/dev",
      SOHOJAC_D1_ID: sharedD1.id,
      RUNNER_TEMP: "/tmp",
    },
  };
  await new AsyncFunction(
    "fs",
    "path",
    "sharedD1",
    "process",
    "fetch",
    "console",
    source,
  )(
    { writeFileSync: (...x) => writes.push(x) },
    { join: (...x) => x.join("/") },
    sharedD1,
    fakeProcess,
    async (url, options) => {
      calls.push({ url, method: options.method });
      if (options.method === "DELETE")
        return Response.json({ success: true, result: null });
      if (url.endsWith("/settings"))
        return Response.json({
          success: true,
          result: {
            bindings: [
              {
                name: "DB",
                type: "d1",
                id: binding === "shared" ? sharedD1.id : "other",
              },
            ],
          },
        });
      if (url.endsWith("/bookmark"))
        return Response.json({
          success: true,
          result: { bookmark: "verified-bookmark" },
        });
      if (!legacy) return new Response(null, { status: 404 });
      return Response.json({
        success: true,
        result: {
          uuid: "1d470521-6146-46c2-ab55-557ad2a27d6c",
          name: "sohojac-dev",
        },
      });
    },
    { log: () => {} },
  );
  return { calls, writes };
}
test("legacy retirement deletes only its exact old ID after both Workers and recovery are confirmed", async () => {
  const { calls, writes } = await retirement();
  assert.equal(writes.length, 1);
  assert.equal(calls.filter((x) => x.method === "DELETE").length, 1);
  assert.ok(calls.at(-1).url.endsWith("/1d470521-6146-46c2-ab55-557ad2a27d6c"));
  assert.ok(
    !calls.some((x) => x.method === "DELETE" && x.url.includes("d6f3e4e9")),
  );
});
test("retirement refuses unmatched Worker bindings and is harmless when old database is absent", async () => {
  await assert.rejects(retirement({ binding: "other" }), /retained/);
  const { calls, writes } = await retirement({ legacy: false });
  assert.equal(writes.length, 0);
  assert.equal(calls.filter((x) => x.method === "DELETE").length, 0);
});
