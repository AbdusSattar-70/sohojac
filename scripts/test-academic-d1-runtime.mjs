import { batchOfferingReadySql } from "../lib/academic-offering-readiness.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire, stripTypeScriptTypes } from "node:module";
import { test } from "node:test";
import { z } from "zod";
import { freshDevBootstrapSql } from "./canonical-dev-bootstrap.mjs";
const local = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = createRequire(
  local.resolve("cf"),
)("miniflare");
function source(file) {
  return stripTypeScriptTypes(fs.readFileSync(file, "utf8"), { mode: "strip" })
    .replace(/^import .*;\r?\n/gm, "")
    .replace(/\bexport (?=(?:async function|function|const))/g, "");
}
const schemas = new Function(
  "z",
  source("modules/offerings/schema.ts") +
    ";return {createOfferingSchema,updateOfferingSchema,publishFeePlanSchema,updateOfferingPublicControlsSchema}",
)(z);
const { commandSchema } = new Function(
  "z",
  source("modules/admissions/schema.ts") + ";return {commandSchema}",
)(z);
test("actual D1 binding supports draft → fee publication → public controls → batch creation and replay", async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      compatibilityDate: "2026-10-01",
      d1Databases: { DB: "academic-regression" },
    }),
  );
  try {
    const DB = await mf.getD1Database("DB");
    for (const file of fs.readdirSync("migrations").filter(f => /^\d{4}_.*\.sql$/.test(f)).sort()) {
      const sql=fs.readFileSync("migrations/"+file,"utf8").replace(/--[^\n]*/g,"").trim();
      if (sql) try { await DB.prepare(sql).run(); }
      catch(error) { throw new Error(file+": "+error.message,{cause:error}); }
    }
    const uid = crypto.randomUUID();
    await DB.prepare(
      `INSERT INTO "user"(id,name,email,"createdAt","updatedAt") VALUES (?,'Local Owner','runtime@example.invalid',0,0)`,
    )
      .bind(uid)
      .run();
    await DB.prepare(
      "INSERT INTO staff_memberships(user_id,role,active) VALUES (?,'OWNER',1)",
    )
      .bind(uid)
      .run();
    // Start the test with the exact clean reference state used for fresh dev D1.
    await DB.prepare(freshDevBootstrapSql()).run();
    const deps = {
      batchOfferingReadySql,
      env: { DB },
      headers: async () =>
        new Headers({
          origin: "https://academy.invalid",
          host: "academy.invalid",
        }),
      getErpContext: async () => ({
        profileId: uid,
        permissions: ["academics.manage", "finance.billing.manage"],
      }),
      revalidatePath: () => {},
      z,
      commandSchema,
      ...schemas,
    };
    const load = (file, names) =>
      new Function(
        ...Object.keys(deps),
        source(file) + ";return {" + names.join(",") + "}",
      )(...Object.values(deps));
    const actions = load("modules/offerings/actions.ts", [
      "createProgrammeOffering",
      "publishFeePlan",
      "updateProgrammeOfferingPublicControls",
    ]);
    Object.assign(deps, load("lib/erp-batches.ts", ["batchCommandSchema"]));
    Object.assign(deps, load("modules/academics/batches/commands.ts", ["runBatchCommand"]));
    const batches = load("modules/academics/batches/actions.ts", [
      "runAcademicBatchCommand",
    ]);
    const idFor = async (table, code) =>
      (
        await DB.prepare(`SELECT id FROM ${table} WHERE code=?`)
          .bind(code)
          .first()
      ).id;
    const created = await actions.createProgrammeOffering({
      requestId: crypto.randomUUID(),
      branchId: await idFor("academy_branches", "MAIN"),
      operationKind: "COACHING",
      teachingStartsOn: "",
      teachingEndsOn: "",
      academicYearId: await idFor("academic_years", "2026"),
      classId: await idFor("academy_classes", "CLASS10"),
      programId: await idFor("academy_programmes", "SSC"),
      groupId: "",
      code: "RUNTIME-SSC",
      name: "SSC Science",
      reason: "Verify actual D1 workflow",
    });
    assert.equal(created.ok, true, JSON.stringify(created));
    const offeringId = created.reference;
    const batchInput = {
      action: "CREATE_BATCH",
      requestId: crypto.randomUUID(),
      offeringId,
      code: "SSC-A",
      name: "SSC Science A",
      capacity: 12,
      reason: "Opening verified teaching batch",
    };
    const rejected = await batches.runAcademicBatchCommand(batchInput);
    assert.equal(rejected.ok, false);
    assert.equal(rejected.field, "offeringId");
    assert.match(rejected.message, /publish.*Fee Plan/i);
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dhaka",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const fees = await actions.publishFeePlan({
      offeringId,
      requestId: crypto.randomUUID(),
      expectedVersion: 1,
      billingCycle: "MONTHLY",
      dueDay: 10,
      effectiveFrom: today,
      reason: "Verify published monthly tuition",
      components: [
        {
          code: "TUITION",
          name: "Tuition",
          amount: 3000,
          chargeType: "TUITION",
          recurrence: "PER_CYCLE",
        },
      ],
    });
    assert.equal(fees.ok, true, JSON.stringify(fees));
    const o = await DB.prepare(
      "SELECT version FROM public_programme_offerings WHERE id=?",
    )
      .bind(offeringId)
      .first();
    const controls = await actions.updateProgrammeOfferingPublicControls({
      offeringId,
      requestId: crypto.randomUUID(),
      expectedVersion: o.version,
      showcaseTitle: "SSC Science",
      showcaseTitleBn: "",
      showcaseDescription: "Small group learning and exam preparation.",
      showcaseDescriptionBn: "",
      showcaseEyebrow: "",
      showcaseEyebrowBn: "",
      publicSchedule: "",
      publicScheduleBn: "",
      publicRequirements: "",
      publicRequirementsBn: "",
      admissionPolicy: "",
      admissionPolicyBn: "",
      showcaseIcon: "graduation-cap",
      showcaseSortOrder: 1,
      isWebsiteVisible: true,
      isAcceptingApplications: true,
      applicationsOpenOn: "",
      applicationsCloseOn: "",
      subjectIds: [],
      reason: "Verify live public controls",
    });
    assert.equal(controls.ok, true, JSON.stringify(controls));
    const made = await batches.runAcademicBatchCommand(batchInput);
    assert.equal(made.ok, true, JSON.stringify(made));
    assert.equal(
      (await batches.runAcademicBatchCommand(batchInput)).entityId,
      made.entityId,
    );
    assert.equal(
      (await DB.prepare("SELECT COUNT(*) n FROM academy_batches").first()).n,
      1,
    );
    assert.equal(
      (
        await DB.prepare(
          "SELECT COUNT(*) n FROM pragma_foreign_key_check",
        ).first()
      ).n,
      0,
    );
    // No historical sample-catalogue seed is needed for a fresh ERP.
    assert.equal((await DB.prepare("SELECT COUNT(*) n FROM academy_offering_subjects").first()).n,0);
  } finally {
    await mf.dispose();
  }
});

