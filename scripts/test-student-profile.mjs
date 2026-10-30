import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { after, beforeEach, test } from "node:test";

// Exercise the actual D1 query adapter against SQLite. Only runtime boundaries
// are injected; the query text, permissions, mapping and money calculations are
// loaded directly from the production TypeScript module.
const source = await readFile(
  new URL("../modules/students/lifecycle/queries.ts", import.meta.url), "utf8",
);
const executable = stripTypeScriptTypes(source, { mode: "strip" })
  .replace(/^import .*;\r?\n/gm, "")
  .replace(/\bexport (?=async function)/g, "");
const db = new DatabaseSync(":memory:");
const studentA = "11111111-1111-4111-8111-111111111111";
const studentB = "22222222-2222-4222-8222-222222222222";
const studentEmpty = "33333333-3333-4333-8333-333333333333";
const missingStudent = "44444444-4444-4444-8444-444444444444";

// Column names and types mirror the existing D1 ledgers; migration replay and
// real Better Auth/Zod/HTTP behavior are covered by the integration workflow.
db.exec(`
  CREATE TABLE academy_students (
    id TEXT PRIMARY KEY, student_no TEXT, full_name TEXT, school_name TEXT,
    status TEXT, created_at TEXT, guardian_name TEXT, guardian_mobile TEXT, merged_into_id TEXT
  );
  CREATE TABLE public_programme_offerings (
    id TEXT PRIMARY KEY, name TEXT, academic_year_name TEXT, class_name TEXT,
    academic_year_id TEXT, is_active INTEGER DEFAULT 1, offering_status TEXT DEFAULT 'ACTIVE'
  );
  CREATE TABLE academic_years (id TEXT PRIMARY KEY, title TEXT);
  CREATE TABLE academy_batches (
    id TEXT PRIMARY KEY, name TEXT, offering_id TEXT, year_id TEXT,
    capacity INTEGER DEFAULT 12, status TEXT DEFAULT 'ACTIVE'
  );
  CREATE TABLE academy_admissions (
    id TEXT PRIMARY KEY, application_no TEXT, status TEXT, created_at TEXT,
    batch_id TEXT, offering_id TEXT, student_id TEXT, fee_plan_id TEXT
  );
  CREATE TABLE academy_enrollments (
    id TEXT PRIMARY KEY, student_id TEXT, batch_id TEXT, enrolled_at TEXT,
    status TEXT, ended_on TEXT
  );
  CREATE TABLE finance_invoices (
    id TEXT PRIMARY KEY, invoice_no TEXT, student_id TEXT, issue_on TEXT,
    due_on TEXT, amount_paisa INTEGER, paid_paisa INTEGER,
    status TEXT, created_at TEXT
  );
  CREATE TABLE academy_fee_plans (id TEXT PRIMARY KEY, source_version INTEGER);
  CREATE TABLE academy_enrollment_transfers (
    id TEXT PRIMARY KEY, student_id TEXT, from_batch_id TEXT, to_batch_id TEXT,
    transferred_on TEXT, authorized_by TEXT, created_at TEXT
  );
`);

const addStudent = db.prepare("INSERT INTO academy_students(id,student_no,full_name,school_name,status,created_at,guardian_name,guardian_mobile) VALUES (?,?,?,?,?,?,?,?)");
addStudent.run(studentA, "SA-000001", "Student Alpha", "Alpha School", "ACTIVE", "2026-10-01T10:00:00Z", "Guardian Alpha", "01700000001");
addStudent.run(studentB, "SA-000002", "Student Beta", "Beta School", "ACTIVE", "2026-10-02T10:00:00Z", "Guardian Beta", "01700000002");
addStudent.run(studentEmpty, "SA-000003", "Student Empty", null, "ACTIVE", "2026-10-03T10:00:00Z", "Guardian Empty", "01700000003");
db.exec(`
  INSERT INTO public_programme_offerings(id,name,academic_year_name,class_name) VALUES
    ('offering-a','Programme Alpha','Offering Year Alpha','Class 10'),
    ('offering-b','Programme Beta','Offering Year Beta','Class 9');
  INSERT INTO academic_years VALUES ('year-a','Academic Year Alpha');
  INSERT INTO academy_batches(id,name,offering_id,year_id) VALUES
    ('batch-a','Batch Alpha','offering-a','year-a'),
    ('batch-b','Batch Beta','offering-b',NULL);
`);
const addAdmission = db.prepare("INSERT INTO academy_admissions(id,application_no,status,created_at,batch_id,offering_id,student_id) VALUES (?,?,?,?,?,?,?)");
addAdmission.run("admission-a", "APP-ALPHA", "ENROLLED", "2026-10-01T11:00:00Z", "batch-a", "offering-a", studentA);
addAdmission.run("admission-b", "APP-BETA", "REJECTED", "2026-10-02T11:00:00Z", "batch-b", "offering-b", studentB);
const addEnrollment = db.prepare("INSERT INTO academy_enrollments(id,student_id,batch_id,enrolled_at,status) VALUES (?,?,?,?,?)");
addEnrollment.run("enrollment-a", studentA, "batch-a", "2026-10-01T12:00:00Z", "ACTIVE");
addEnrollment.run("enrollment-b", studentB, "batch-b", "2026-10-02T12:00:00Z", "COMPLETED");

const addInvoice = db.prepare("INSERT INTO finance_invoices VALUES (?,?,?,?,?,?,?,?,?)");
for (let n = 0; n < 201; n++) {
  addInvoice.run(`invoice-a-${String(n).padStart(3, "0")}`, `INV-A-${n}`, studentA, "2026-10-30", null, 101, 1, "PARTIAL", "2026-10-30T10:00:00Z");
}
addInvoice.run("invoice-draft", "DRAFT-EXCLUDED", studentA, "2026-10-30", null, 999999, 0, "DRAFT", "2026-10-30T10:00:00Z");
addInvoice.run("invoice-void", "VOID-EXCLUDED", studentA, "2026-10-30", null, 999999, 0, "VOID", "2026-10-30T10:00:00Z");
addInvoice.run("invoice-b", "INV-B-EXCLUDED", studentB, "2026-10-30", null, 888888, 0, "ISSUED", "2026-10-30T10:00:00Z");

let permissions = [];
let authChecks = [];
let queries = [];
const env = {
  DB: {
    prepare(sql) {
      assert.match(sql, /^SELECT\b/, "Profile queries must remain read-only");
      const statement = db.prepare(sql);
      const bind = (...values) => {
        queries.push({ sql, values });
        return {
          async first() { return statement.get(...values) ?? null; },
          async all() { return { results: statement.all(...values) }; },
        };
      };
      return { bind, async all() { return bind().all(); } };
    },
  },
};
const z = {
  // Stub only the external validation dependency. Real Zod invalid-route and
  // missing-route checks run in the authenticated HTTP integration tests.
  string: () => ({
    uuid: () => ({
      safeParse: (value) => ({
        success: typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
      }),
    }),
  }),
};
async function requirePermission(permission) {
  authChecks.push(permission);
  if (!permissions.includes(permission)) throw new Error("Permission denied");
  return { permissions };
}
const getStudentProfile = new Function(
  "env", "z", "requirePermission", `${executable}\nreturn getStudentProfile;`,
)(env, z, requirePermission);

beforeEach(() => {
  permissions = ["students.view"];
  authChecks = [];
  queries = [];
});
after(() => db.close());

test("student permission is enforced before any database read", async () => {
  permissions = ["finance.view", "admissions.view"];
  await assert.rejects(getStudentProfile(studentA), /Permission denied/);
  assert.deepEqual(authChecks, ["students.view"]);
  assert.equal(queries.length, 0);
});

test("invalid and missing identities never fall through to another student", async () => {
  assert.equal(await getStudentProfile("not-an-id"), null);
  assert.equal(queries.length, 0);
  assert.equal(await getStudentProfile(missingStudent), null);
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].values, [missingStudent]);
});

test("student-only permission reads the selected identity and enrollment without admissions or money", async () => {
  const profile = await getStudentProfile(studentA);
  assert.equal(profile.student.id, studentA);
  assert.equal(profile.student.number, "SA-000001");
  assert.deepEqual(profile.guardian, { name: "Guardian Alpha", mobile: "01700000001" });
  assert.deepEqual(profile.enrollments, [{
    id: "enrollment-a", studentId: studentA, year: "Academic Year Alpha", class: "Class 10",
    batch: "Batch Alpha", startsOn: "2026-10-01T12:00:00Z", endsOn: null, status: "ACTIVE",
  }]);
  assert.equal(profile.admissionsVisible, false);
  assert.deepEqual(profile.admissions, []);
  assert.equal(profile.financeVisible, false);
  assert.deepEqual(profile.invoices, []);
  assert.equal(profile.financeTotals, null);
  assert.equal(profile.financeInvoiceCount, 0);
  assert.ok(queries.every(({ sql }) => !/FROM (academy_admissions|finance_invoices)\b/.test(sql)));
  assert.ok(queries.every(({ values }) => values.length > 0 && values.every((value) => value === studentA)));
});

test("admission permission adds only that student's cases without enabling finance", async () => {
  permissions.push("admissions.view");
  const profile = await getStudentProfile(studentA);
  assert.equal(profile.admissionsVisible, true);
  assert.deepEqual(profile.admissions, [{
    id: "admission-a", number: "APP-ALPHA", studentId: studentA, status: "ENROLLED",
    createdAt: "2026-10-01T11:00:00Z", batch: "Batch Alpha", batchId: "batch-a",
    offering: "Programme Alpha", offeringId: "offering-a", feeVersion: null,
  }]);
  assert.equal(profile.financeVisible, false);
  assert.ok(queries.every(({ sql }) => !/FROM finance_invoices\b/.test(sql)));
});

test("finance permission returns 200 invoices while count and exact integer totals cover all 201 posted invoices", async () => {
  permissions.push("finance.view");
  const profile = await getStudentProfile(studentA);
  assert.equal(profile.financeVisible, true);
  assert.equal(profile.invoices.length, 200);
  assert.equal(profile.financeInvoiceCount, 201);
  assert.deepEqual(profile.financeTotals, { gross: 203.01, paid: 2.01, due: 201 });
  assert.equal(profile.invoices[0].number, "INV-A-200");
  assert.ok(profile.invoices.every((invoice) => invoice.number.startsWith("INV-A-")));
  assert.ok(profile.invoices.every((invoice) => invoice.gross === 1.01 && invoice.paid === 0.01 && invoice.due === 1));
  assert.equal(profile.admissionsVisible, false);
  assert.ok(queries.every(({ sql }) => !/FROM academy_admissions\b/.test(sql)));
});

test("an authorized empty ledger has genuine zero totals and no invented history", async () => {
  permissions.push("finance.view", "admissions.view");
  const profile = await getStudentProfile(studentEmpty);
  assert.equal(profile.student.school, null);
  assert.deepEqual(profile.admissions, []);
  assert.deepEqual(profile.enrollments, []);
  assert.deepEqual(profile.invoices, []);
  assert.equal(profile.financeInvoiceCount, 0);
  assert.deepEqual(profile.financeTotals, { gross: 0, paid: 0, due: 0 });
});

test("enrollment year falls back to the offering when no academic-year row exists", async () => {
  const profile = await getStudentProfile(studentB);
  assert.equal(profile.enrollments.length, 1);
  assert.equal(profile.enrollments[0].year, "Offering Year Beta");
  assert.equal(profile.enrollments[0].status, "COMPLETED");
});
