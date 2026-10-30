import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test, beforeEach, after } from "node:test";
let db;
const seed = fs.readFileSync("seeds/development.sql", "utf8");
beforeEach(() => {
  db?.close();
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for (const file of fs
    .readdirSync("migrations")
    .filter((f) => /^\d{4}.*sql$/.test(f))
    .sort())
    db.exec(fs.readFileSync("migrations/" + file, "utf8"));
});
after(() => db?.close());
function owner() {
  db.exec(
    `INSERT INTO "user"(id,name,email,"createdAt","updatedAt") VALUES ('owner','Existing Owner','seed@example.invalid',0,0); INSERT INTO staff_memberships(user_id,role,active) VALUES ('owner','OWNER',1);`,
  );
}
const n = (table) => db.prepare("SELECT COUNT(*) n FROM " + table).get().n;
test("seed refuses missing owner without inventing accounts or partial records", () => {
  assert.throws(() => db.exec(seed));
  assert.equal(n("academy_branches"), 0);
  assert.equal(n("user"), 0);
});
test("seed is repeatable, clearly marked, hidden from public and posts no financial transactions", () => {
  owner();
  for (let i = 0; i < 3; i++) db.exec(seed);
  assert.equal(n("user"), 1);
  assert.equal(n("academy_admissions"), 2);
  assert.equal(n("academy_prospects"), 1);
  assert.equal(n("academy_fee_plan_components"), 2);
  assert.equal(
    db
      .prepare(
        "SELECT show_on_website FROM public_programme_offerings WHERE id='test-readiness-2027'",
      )
      .get().show_on_website,
    0,
  );
  for (const table of [
    "finance_invoices",
    "finance_payments",
    "finance_journals",
    "academy_enrollments",
  ])
    assert.equal(n(table), 0);
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM pragma_foreign_key_check").get().n,
    0,
  );
});
test("reapplying seed preserves existing credentials, live rows and staff edits", () => {
  owner();
  db.exec(
    "INSERT INTO academy_classes(id,code,name) VALUES ('live-class','LIVE','Existing real class')",
  );
  db.exec(seed);
  db.exec(
    "UPDATE academy_students SET full_name='TEST — Staff edited student' WHERE student_no='TEST-SA-000001'",
  );
  db.exec(seed);
  assert.equal(
    db
      .prepare(
        "SELECT full_name FROM academy_students WHERE student_no='TEST-SA-000001'",
      )
      .get().full_name,
    "TEST — Staff edited student",
  );
  assert.equal(
    db.prepare("SELECT name FROM academy_classes WHERE id='live-class'").get()
      .name,
    "Existing real class",
  );
  assert.equal(
    db.prepare('SELECT name FROM "user"').get().name,
    "Existing Owner",
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
