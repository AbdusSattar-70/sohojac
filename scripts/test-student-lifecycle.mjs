import {z} from "zod";
import { recordStudentPayment } from "../modules/finance/payments/record-payment.ts";
import assert from "node:assert/strict";
import { readFile, readdir, access } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, afterEach, test } from "node:test";

const root = new URL("../", import.meta.url);
const id = () => crypto.randomUUID();
const ids = {
  student: "11111111-1111-4111-8111-111111111111",
  duplicate: "22222222-2222-4222-8222-222222222222",
  other: "33333333-3333-4333-8333-333333333333",
  admission: "44444444-4444-4444-8444-444444444444",
  duplicateAdmission: "55555555-5555-4555-8555-555555555555",
  enrollment: "66666666-6666-4666-8666-666666666666",
  duplicateEnrollment: "77777777-7777-4777-8777-777777777777",
  batch: "88888888-8888-4888-8888-888888888888",
  destination: "99999999-9999-4999-8999-999999999999",
  nextBatch: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  fee: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  nextFee: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
};
const baselineFolder = new URL("migrations/",root);
const baselineNames = (await readdir(baselineFolder)).filter(name=>/^\d{4}_.*\.sql$/.test(name)).sort();
assert.deepEqual(baselineNames.slice(0,4),["0001_schema_tables.sql","0002_schema_indexes.sql","0003_domain_guards.sql","0004_finance_reference.sql"]);
const baselineSql = await Promise.all(baselineNames.map(name=>readFile(new URL(name,baselineFolder),"utf8")));
const source = await readFile(new URL("modules/students/lifecycle/command-store.ts", root), "utf8");
const executable = stripTypeScriptTypes(source, { mode: "strip" })
  .replace(/^import .*;\r?\n/gm, "")
  .replace(/\bexport (?=(?:async function|function|const))/g, "");
let db;
let beforeBatch;
let profilePermissions;
const env = {
  DB: {
    prepare(sql) {
      const bind = (...values) => {
          const execute = () => {
            const results = db.prepare(sql).all(...values);
            const changes = /^\s*SELECT\b/i.test(sql) ? 0 : Number(db.prepare("SELECT changes() AS n").get().n);
            return { success: true, results, meta: { changes } };
          };
          return {
            execute,
            async first() { return execute().results[0] ?? null; },
            async all() { return execute(); },
          };
      };
      return { bind, async all() { return bind().all(); } };
    },
    async batch(statements) {
      if (beforeBatch) { const hook = beforeBatch; beforeBatch = null; hook(); }
      db.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((statement) => statement.execute());
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  },
};
const { executeStudentCommand, executeEnrollmentClosure, executeStudentState } = new Function(
  "env", `${executable}\nreturn {executeStudentCommand,executeEnrollmentClosure,executeStudentState};`,
)(env);
const profileSource = await readFile(new URL("modules/students/lifecycle/queries.ts", root), "utf8");
const profileExecutable = stripTypeScriptTypes(profileSource, { mode: "strip" })
  .replace(/^import .*;\r?\n/gm, "").replace(/\bexport (?=async function)/g, "");
const getStudentProfile = new Function("env", "z", "requirePermission", `${profileExecutable}\nreturn getStudentProfile;`)(
  env, { string: () => ({ uuid: () => ({ safeParse: (value) => ({ success: /^[0-9a-f-]{36}$/i.test(value) }) }) }) },
  async (permission) => {
    if (!profilePermissions.includes(permission)) throw new Error("Permission denied");
    return { permissions: profilePermissions };
  },
);
const command = (action, overrides = {}) => ({
  action, request_id: id(), student_id: ids.student,
  reason: "Verified source lifecycle integration test", ...overrides,
});
const rows = (table) => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
const financeSnapshot = () => JSON.stringify([
  rows("finance_invoices"), rows("finance_payments"), rows("finance_allocations"),
  rows("finance_journals"), rows("finance_journal_lines"),
]);

function seedLegacy(futureEnrollment = false) {
  db.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,?,?,?)')
    .run("actor", "Synthetic authorized actor", "actor@example.test", 1, 1, 1);
  db.prepare('INSERT INTO "user"(id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,?,?,?)')
    .run("other-actor", "Other synthetic actor", "other@example.test", 1, 1, 1);
  db.prepare("INSERT INTO staff_memberships(user_id,role,active) VALUES ('actor','OWNER',1),('other-actor','OPERATOR',1)").run();
  const offering = db.prepare("INSERT INTO public_programme_offerings(id,code,name,academic_year_name,class_name,is_active,offering_status) VALUES (?,?,?,?,?,1,'ACTIVE')");
  offering.run("student-offering", "STUDENT-2026", "Synthetic current offering", "2026", "Class 10");
  offering.run("student-next-offering", "STUDENT-2027", "Synthetic following offering", "2027", "Class 10");
  const batch = db.prepare("INSERT INTO academy_batches(id,code,name,offering_id,capacity,status) VALUES (?,?,?,?,12,'ACTIVE')");
  batch.run(ids.batch, "STUDENT-OLD", "Original batch", "student-offering");
  batch.run(ids.destination, "STUDENT-NEW", "Destination batch", "student-offering");
  batch.run(ids.nextBatch, "STUDENT-NEXT", "Next-year batch", "student-next-offering");
  const fee = db.prepare("INSERT INTO academy_fee_plans(id,offering_id,title,monthly_amount_paisa,admission_amount_paisa,active) VALUES (?,?,?,10001,501,1)");
  fee.run(ids.fee, "student-offering", "Original exact-price fee");
  fee.run(ids.nextFee, "student-next-offering", "Following exact-price fee");
  const student = db.prepare("INSERT INTO academy_students(id,student_no,full_name,class_grade,guardian_name,guardian_mobile,school_name,status) VALUES (?,?,?,10,?,?,?,?)");
  student.run(ids.student, "SA-000001", "Synthetic canonical student", "Verified guardian", "01700000001", "Original school", "ACTIVE");
  student.run(ids.duplicate, "SA-000002", "Historical spelling", "Same verified guardian", "01700000001", "Historical school", "INACTIVE");
  student.run(ids.other, "SA-000003", "Unrelated student", "Unrelated guardian", "01700000003", "Other school", "INACTIVE");
  const admission = db.prepare("INSERT INTO academy_admissions(id,application_no,offering_id,student_id,status,prepared_by,student_full_name,guardian_full_name,guardian_mobile,batch_id,fee_plan_id) VALUES (?,?,?, ?,?,'actor',?,?,?,?,?)");
  admission.run(ids.admission, "APP-ORIGINAL", "student-offering", ids.student, "ENROLLED", "Synthetic canonical student", "Verified guardian", "01700000001", ids.batch, ids.fee);
  admission.run(ids.duplicateAdmission, "APP-HISTORICAL", "student-offering", ids.duplicate, "CANCELLED", "Historical spelling", "Same verified guardian", "01700000001", ids.batch, ids.fee);
  const enrollment = db.prepare("INSERT INTO academy_enrollments(id,student_id,batch_id,admission_id,status,enrolled_at) VALUES (?,?,?,?,'ACTIVE',?)");
  enrollment.run(ids.enrollment, ids.student, ids.batch, ids.admission, futureEnrollment ? new Date(Date.now() + 2*86400000).toISOString() : '2000-01-01T00:00:00Z');
  enrollment.run(ids.duplicateEnrollment, ids.duplicate, ids.batch, ids.duplicateAdmission, '2000-01-01T00:00:00Z');
  db.prepare("INSERT INTO academy_attendance(id,enrollment_id,class_on,state,recorded_by) VALUES ('attendance-preserve',?,'2000-01-02','PRESENT','actor')").run(ids.duplicateEnrollment);
  db.prepare("INSERT INTO academy_assessments(id,batch_id,title,subject,held_on,max_marks,created_by) VALUES ('assessment-preserve',?,'Historical exam','Maths','2000-01-02',100,'actor')").run(ids.batch);
  db.prepare("INSERT INTO academy_assessment_results(id,assessment_id,enrollment_id,obtained_marks,graded_by) VALUES ('grade-preserve','assessment-preserve',?,81,'actor')").run(ids.duplicateEnrollment);
  db.prepare("UPDATE academy_enrollments SET status='WITHDRAWN' WHERE id=?").run(ids.duplicateEnrollment);
  db.prepare("INSERT INTO finance_invoices(id,invoice_no,student_id,admission_id,issue_on,amount_paisa,status,created_by) VALUES ('invoice-preserve','INV-HISTORY',?,?,'2000-01-01',10502,'ISSUED','actor')").run(ids.duplicate, ids.duplicateAdmission);
  db.prepare("INSERT INTO finance_payments(id,receipt_no,student_id,amount_paisa,payment_method,received_by) VALUES ('payment-preserve','REC-HISTORY',?,502,'CASH','actor')").run(ids.duplicate);
  db.exec("INSERT INTO finance_allocations(id,payment_id,invoice_id,amount_paisa) VALUES ('allocation-preserve','payment-preserve','invoice-preserve',502)");
}

beforeEach((context) => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for (const sql of baselineSql) db.exec(sql);
  seedLegacy(context.name === "an enrollment starting on a future Dhaka day cannot be closed");
  beforeBatch = null;
  profilePermissions = ["students.view", "admissions.view", "finance.view", "students.manage", "admissions.create"];
});
afterEach(() => db.close());
function migrate() { /* Current canonical schema is applied during beforeEach. */ }

test("canonical schema protects student, finance and assessment references", () => {
  const tables=["academy_students","academy_admissions","academy_enrollments","academy_attendance","academy_assessments","academy_assessment_results"];
  const original=Object.fromEntries(tables.map(table=>[table,rows(table)]));
  const financial=financeSnapshot();migrate();
  for(const [table,expected] of Object.entries(original))assert.deepEqual(rows(table),expected,table);
  assert.equal(financeSnapshot(),financial);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_schema WHERE name LIKE '%_pre_0029'").get().n,0);
  assert.throws(()=>db.prepare("UPDATE academy_enrollments SET batch_id=? WHERE id=?").run(ids.destination,ids.enrollment),/Historical enrollment placement/);
  assert.throws(()=>db.exec("UPDATE academy_assessment_results SET obtained_marks=82 WHERE id='grade-preserve'"),/Assessment is not ready/);
});

test("re-enrollment creates only a draft with the same permanent identity and pinned fee terms", async () => {
  migrate();
  const finance = financeSnapshot();
  const input = command("CREATE_EXISTING", { batch_id: ids.nextBatch });
  const result = await executeStudentCommand(input, "actor");
  assert.equal(result.ok, true, result.message);
  const draft = db.prepare("SELECT * FROM academy_admissions WHERE id=?").get(result.admissionId);
  assert.equal(draft.student_id, ids.student);
  assert.equal(draft.existing_student, 1);
  assert.equal(draft.status, "DRAFT");
  assert.equal(draft.fee_plan_id, ids.nextFee);
  assert.equal(draft.consent_verified, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM academy_students").get().n, 3);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM academy_enrollments").get().n, 2);
  assert.equal(financeSnapshot(), finance);
  assert.deepEqual(await executeStudentCommand(input, "actor"), result);
  assert.equal((await executeStudentCommand({ ...input, reason: "Different payload must not replay" }, "actor")).ok, false);
  assert.equal((await executeStudentCommand(input, "other-actor")).ok, false);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM erp_audit_events WHERE action='CREATE_EXISTING'").get().n, 1);
});

test("same-year duplicate drafts and concurrent requests cannot reserve extra identities or seats", async () => {
  migrate();
  assert.equal((await executeStudentCommand(command("CREATE_EXISTING", { batch_id: ids.destination }), "actor")).ok, false);
  const outcomes = await Promise.all([
    executeStudentCommand(command("CREATE_EXISTING", { student_id: ids.other, batch_id: ids.nextBatch }), "actor"),
    executeStudentCommand(command("CREATE_EXISTING", { student_id: ids.other, batch_id: ids.nextBatch }), "actor"),
  ]);
  assert.equal(outcomes.filter((value) => value.ok).length, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM academy_admissions WHERE student_id=?").get(ids.other).n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM academy_student_command_keys").get().n, 1);
});

test("transfer preserves the previous enrollment, grades, money and fee plan, including a later return to the original batch", async () => {
  migrate();
  const finance = financeSnapshot();
  const original = db.prepare("SELECT * FROM academy_enrollments WHERE id=?").get(ids.enrollment);
  const first = command("TRANSFER", { admission_id: ids.admission, batch_id: ids.destination });
  const result = await executeStudentCommand(first, "actor");
  assert.equal(result.ok, true, result.message);
  const closed = db.prepare("SELECT * FROM academy_enrollments WHERE id=?").get(ids.enrollment);
  assert.equal(closed.status, "WITHDRAWN");
  assert.match(closed.ended_on, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(closed.batch_id, original.batch_id);
  assert.equal(closed.enrolled_at, original.enrolled_at);
  assert.equal(db.prepare("SELECT batch_id FROM academy_enrollments WHERE admission_id=? AND status='ACTIVE'").get(ids.admission).batch_id, ids.destination);
  assert.equal(db.prepare("SELECT fee_plan_id FROM academy_admissions WHERE id=?").get(ids.admission).fee_plan_id, ids.fee);
  assert.deepEqual(await executeStudentCommand(first, "actor"), result);
  const back = await executeStudentCommand(command("TRANSFER", { admission_id: ids.admission, batch_id: ids.batch }), "actor");
  assert.equal(back.ok, true, back.message);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM academy_enrollment_transfers").get().n, 2);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM academy_enrollments WHERE admission_id=?").get(ids.admission).n, 3);
  assert.equal(financeSnapshot(), finance);
});

test("capacity or placement changes roll back every transfer write and leave no request or audit", async () => {
  migrate();
  const before = JSON.stringify(rows("academy_enrollments"));
  beforeBatch = () => db.prepare("UPDATE academy_batches SET status='CANCELLED' WHERE id=?").run(ids.destination);
  const result = await executeStudentCommand(command("TRANSFER", { admission_id: ids.admission, batch_id: ids.destination }), "actor");
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(rows("academy_enrollments")), before);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM academy_enrollment_transfers").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM academy_student_command_keys").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM erp_audit_events").get().n, 0);
});

test("verified merge archives only a matching closed duplicate and retains every original financial and history ID", async () => {
  migrate();
  const finance = financeSnapshot();
  const historical = JSON.stringify(rows("academy_enrollments"));
  const input = command("MERGE", { student_id: ids.duplicate, target_id: ids.student, confirmed_same_person: true });
  const result = await executeStudentCommand(input, "actor");
  assert.equal(result.ok, true, result.message);
  const duplicate = db.prepare("SELECT * FROM academy_students WHERE id=?").get(ids.duplicate);
  assert.equal(duplicate.status, "ARCHIVED");
  assert.equal(duplicate.merged_into_id, ids.student);
  assert.equal(duplicate.student_no, "SA-000002");
  assert.equal(JSON.stringify(rows("academy_enrollments")), historical);
  assert.equal(financeSnapshot(), finance);
  assert.deepEqual(await executeStudentCommand(input, "actor"), result);
  assert.equal((await executeStudentState({ id: ids.duplicate, active: true, reason: "Cannot reactivate verified duplicate" }, "actor")).ok, false);
  assert.throws(() => db.prepare("UPDATE academy_student_merges SET target_id=?").run(ids.other), /immutable/);
});

test("merge rejects missing confirmation, unrelated identities and a student with active enrollment", async () => {
  migrate();
  const attempts = [
    command("MERGE", { student_id: ids.duplicate, target_id: ids.student }),
    command("MERGE", { student_id: ids.other, target_id: ids.student, confirmed_same_person: true }),
    command("MERGE", { student_id: ids.student, target_id: ids.duplicate, confirmed_same_person: true }),
  ];
  for (const input of attempts) assert.equal((await executeStudentCommand(input, "actor")).ok, false);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM academy_student_merges").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM academy_student_command_keys").get().n, 0);
});

test("closure is idempotent, releases the active seat, closes the case and leaves all balances untouched", async () => {
  migrate();
  const finance = financeSnapshot();
  const input = { student_id: ids.student, enrollment_id: ids.enrollment, mode: "COMPLETED", reason: "Programme completion verified with guardian" };
  assert.equal((await executeEnrollmentClosure(input, "actor")).ok, true);
  assert.equal(db.prepare("SELECT status FROM academy_enrollments WHERE id=?").get(ids.enrollment).status, "COMPLETED");
  assert.equal(db.prepare("SELECT status FROM academy_admissions WHERE id=?").get(ids.admission).status, "CLOSED_ENROLLMENT");
  assert.equal(db.prepare("SELECT status FROM academy_students WHERE id=?").get(ids.student).status, "INACTIVE");
  assert.equal((await executeEnrollmentClosure(input, "actor")).ok, true);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM erp_audit_events WHERE entity_type='enrollment'").get().n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM academy_student_enrollment_closures").get().n, 1);
  assert.equal(financeSnapshot(), finance);
  assert.equal((await executeStudentState({ id: ids.student, active: true, reason: "Cannot reactivate without active enrollment" }, "actor")).ok, false);
});

test("ordinary state changes require the enrollment predicate and cannot erase history", async () => {
  migrate();
  assert.equal((await executeStudentState({ id: ids.student, active: false, reason: "Still has active teaching enrollment" }, "actor")).ok, false);
  assert.equal((await executeStudentState({ id: ids.student, active: true, reason: "Verified existing active enrollment" }, "actor")).ok, true);
  assert.equal((await executeStudentState({ id: ids.other, active: false, reason: "Verified no active enrollment" }, "actor")).ok, true);
  assert.equal(db.prepare("SELECT status FROM academy_students WHERE id=?").get(ids.other).status, "INACTIVE");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM academy_students").get().n, 3);
});

test("an enrollment starting on a future Dhaka day cannot be closed", async () => {
  // The canonical database forbids editing historic placement dates.
  // Seed the future-dated enrollment at INSERT time instead.
  migrate();
  const result = await executeEnrollmentClosure({
    student_id: ids.student, enrollment_id: ids.enrollment,
    mode: "WITHDRAWN", reason: "Future start must use admission cancellation instead",
  }, "actor");
  assert.equal(result.ok, false);
  assert.equal(db.prepare("SELECT status FROM academy_enrollments WHERE id=?").get(ids.enrollment).status, "ACTIVE");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM academy_student_enrollment_closures").get().n, 0);
});

test("a verified canonical profile includes original linked identities and their exact financial/enrollment histories", async () => {
  migrate();
  assert.equal((await executeStudentCommand(command("MERGE", {
    student_id: ids.duplicate, target_id: ids.student, confirmed_same_person: true,
  }), "actor")).ok, true);
  const canonical = await getStudentProfile(ids.student);
  assert.equal(canonical.student.canonicalId, ids.student);
  assert.deepEqual(canonical.identities.map((identity) => identity.id).sort(), [ids.student, ids.duplicate].sort());
  assert.equal(canonical.guardianContacts.length, 2);
  assert.equal(canonical.admissions.length, 2);
  assert.equal(canonical.enrollments.length, 2);
  assert.equal(canonical.invoices.length, 1);
  assert.equal(canonical.invoices[0].studentId, ids.duplicate);
  assert.equal(canonical.invoices[0].studentNumber, "SA-000002");
  assert.deepEqual(canonical.financeTotals, { gross: 105.02, paid: 5.02, due: 100 });
  const duplicate = await getStudentProfile(ids.duplicate);
  assert.equal(duplicate.student.status, "ARCHIVED");
  assert.equal(duplicate.student.canonicalNumber, "SA-000001");
  assert.deepEqual(duplicate.invoices, canonical.invoices);
  assert.equal(duplicate.identities.some((identity) => identity.id === ids.other), false);
});

test("student command actor rechecks named permissions and the exact configured staff origin", async () => {
  const contextSource = await readFile(new URL("modules/students/lifecycle/command-context.ts", root), "utf8");
  const code = stripTypeScriptTypes(contextSource, { mode: "strip" })
    .replace(/^import .*;\r?\n/gm, "").replace(/\bexport (?=async function)/g, "");
  let context = { profileId: "actor", permissions: ["students.view", "admissions.create"] };
  let h = new Headers({ host: "staff.example.test", origin: "https://staff.example.test" });
  const actor = new Function("env", "headers", "getErpContext", `${code}\nreturn studentCommandActor;`)(
    { BETTER_AUTH_URL: "https://staff.example.test" }, async () => h, async () => context,
  );
  assert.equal(await actor("admissions.create"), "actor");
  assert.equal(await actor("students.manage"), null);
  context = { profileId: "actor", permissions: ["admissions.create"] };
  assert.equal(await actor("admissions.create"), null);
  context = { profileId: "actor", permissions: ["students.manage"] };
  assert.equal(await actor("students.manage", false), "actor");
  for (const origin of [null, "https://unrelated.example", "http://staff.example.test"]) {
    h = new Headers({ host: "staff.example.test" });
    if (origin) h.set("origin", origin);
    assert.equal(await actor("students.manage", false), null);
  }
  h = new Headers({ host: "staff.example.test", origin: "https://staff.example.test", "sec-fetch-site": "cross-site" });
  assert.equal(await actor("students.manage", false), null);
});

test("legacy oversized batches still obey the current twelve-seat policy in commands, profile and database guard", async () => {
  db.prepare("UPDATE academy_batches SET capacity=100 WHERE id=?").run(ids.destination);
  for (let n = 0; n < 12; n++) {
    const sid = id(), aid = id();
    db.prepare("INSERT INTO academy_students(id,student_no,full_name,guardian_name,guardian_mobile,status) VALUES (?,?,?,?,?,'ACTIVE')")
      .run(sid, `SA-${String(n + 4).padStart(6, "0")}`, `Capacity student ${n}`, "Capacity guardian", "01700000009");
    db.prepare("INSERT INTO academy_admissions(id,application_no,offering_id,student_id,status,prepared_by,batch_id) VALUES (?,?,?,?,'ENROLLED','actor',?)")
      .run(aid, `CAP-${n}`, "student-offering", sid, ids.destination);
    db.prepare("INSERT INTO academy_enrollments(id,student_id,batch_id,admission_id,status) VALUES (?,?,?,?,'ACTIVE')")
      .run(id(), sid, ids.destination, aid);
  }
  migrate();
  const before = JSON.stringify(rows("academy_enrollments"));
  assert.equal((await executeStudentCommand(command("TRANSFER", { admission_id: ids.admission, batch_id: ids.destination }), "actor")).ok, false);
  assert.equal((await executeStudentCommand(command("CREATE_EXISTING", { student_id: ids.other, batch_id: ids.destination }), "actor")).ok, false);
  assert.equal(JSON.stringify(rows("academy_enrollments")), before);
  const profile = await getStudentProfile(ids.student);
  const option = profile.batches.find((batch) => batch.id === ids.destination);
  assert.equal(option.capacity, 12);
  assert.equal(option.occupied, 12);
  const aid = id();
  db.prepare("INSERT INTO academy_admissions(id,application_no,offering_id,student_id,status,prepared_by,batch_id,existing_student) VALUES (?,?,?,?,'ENROLLED','actor',?,1)")
    .run(aid, "CAP-GUARD", "student-offering", ids.other, ids.destination);
  assert.throws(() => db.prepare("INSERT INTO academy_enrollments(id,student_id,batch_id,admission_id,status) VALUES (?,?,?,?,'ACTIVE')")
    .run(id(), ids.other, ids.destination, aid), /Batch capacity exceeded/);
});

test("independent yearless training courses do not collapse into one academic-year identity", async () => {
  migrate();
  const courses = [];
  for (let n = 0; n < 2; n++) {
    const offeringId = `training-course-${n}`, batchId = id();
    db.prepare("INSERT INTO public_programme_offerings(id,code,name,academic_year_name,class_name,operation_kind,is_active,offering_status) VALUES (?,?,?,'','','TRAINING',1,'ACTIVE')")
      .run(offeringId, `TRAIN-${n}`, `Independent training course ${n}`);
    db.prepare("INSERT INTO academy_batches(id,code,name,offering_id,capacity,status) VALUES (?,?,?,?,12,'ACTIVE')")
      .run(batchId, `TRAIN-BATCH-${n}`, `Training batch ${n}`, offeringId);
    db.prepare("INSERT INTO academy_fee_plans(id,offering_id,title,monthly_amount_paisa,admission_amount_paisa,active) VALUES (?,?,?,500,0,1)")
      .run(id(), offeringId, `Training fee ${n}`);
    const response = await executeStudentCommand(command("CREATE_EXISTING", { student_id: ids.other, batch_id: batchId }), "actor");
    assert.equal(response.ok, true, response.message);
    courses.push({ batchId, admissionId: response.admissionId });
  }
  for (const course of courses) {
    db.prepare("UPDATE academy_admissions SET status='ENROLLED' WHERE id=?").run(course.admissionId);
    db.prepare("INSERT INTO academy_enrollments(id,student_id,batch_id,admission_id,status) VALUES (?,?,?,?,'ACTIVE')")
      .run(id(), ids.other, course.batchId, course.admissionId);
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM academy_enrollments WHERE student_id=? AND status='ACTIVE'").get(ids.other).n, 2);
  const profile = await getStudentProfile(ids.other);
  assert.ok(profile.enrollments.every((enrollment) => enrollment.year === "Not applicable" && enrollment.class === "Not applicable"));
});

const admissionCode=stripTypeScriptTypes(await readFile(new URL("modules/admissions/lifecycle.ts",root),"utf8"),{mode:"strip"}).replace(/^import .*;\r?\n/gm,"").replace(/\bexport (?=async function)/g,"");
const admissions=new Function("env","z","revalidatePath","getErpContext","requirePermission","recordStudentPayment",admissionCode+";return {receivePhysicalConsent,finalizeAdmission,collectAdmissionPayment,activateAdmission}")(env,z,()=>{},async()=>({profileId:"actor",permissions:["admissions.create","admissions.view","finance.billing.manage","finance.payments.post"]}),async()=>({permissions:["admissions.view"]}),recordStudentPayment);
test("existing-student reviewed admission receives consent, bills, collects and activates on populated migrated ledgers",async()=>{
 migrate();const originalStudents=rows("academy_students");const priorSequence=db.prepare("SELECT COUNT(*) n FROM academy_student_number_sequence").get().n;
 /* Payment posting schema is already part of the canonical migrations. */
 const result=await executeStudentCommand(command("CREATE_EXISTING",{batch_id:ids.nextBatch}),"actor");assert.equal(result.ok,true,result.message);
 const admissionId=result.admissionId;
 // The staff has verified the returning student's application and address.
 db.prepare("UPDATE academy_admissions SET status='REVIEW',version=version+1 WHERE id=?").run(admissionId);
 db.prepare("INSERT INTO academy_admission_referrals(admission_id,source,recorded_by,reason) VALUES (?,'ORGANIC','actor','Verified returning student source')").run(admissionId);
 const consent=await admissions.receivePhysicalConsent({admissionId,requestId:id(),guardianSignedOn:new Date().toISOString().slice(0,10),studentSigned:true,physicalCopyReference:"Synthetic signed paper",reason:"Staff verified returning guardian signature"});assert.equal(consent.ok,true,consent.message);
 const finalized=await admissions.finalizeAdmission({admissionId,requestId:id(),reason:"Verified returning student bill"});assert.equal(finalized.ok,true,finalized.message);
 assert.deepEqual(rows("academy_students"),originalStudents);assert.equal(db.prepare("SELECT COUNT(*) n FROM academy_student_number_sequence").get().n,priorSequence);
 const invoice=db.prepare("SELECT * FROM finance_invoices WHERE admission_id=?").get(admissionId);assert.equal(invoice.student_id,ids.student);assert.equal(invoice.amount_paisa,10502);
 assert.equal((await admissions.activateAdmission({admissionId,requestId:id(),reason:"Must reject an unpaid existing admission"})).ok,false);
 const paymentInput={admissionId,requestId:id(),amount:105.02,method:"CASH",reference:"Synthetic integration receipt",reason:"Received actual returning student tuition"};
 const payment=await admissions.collectAdmissionPayment(paymentInput);assert.equal(payment.ok,true,payment.message);assert.equal((await admissions.collectAdmissionPayment(paymentInput)).ok,true);
 const activated=await admissions.activateAdmission({admissionId,requestId:id(),reason:"Verified paid returning admission"});assert.equal(activated.ok,true,activated.message);
 assert.equal(db.prepare("SELECT student_id FROM academy_enrollments WHERE admission_id=? AND status='ACTIVE'").get(admissionId).student_id,ids.student);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM academy_students").get().n,originalStudents.length);
 assert.equal(db.prepare("SELECT amount_paisa FROM finance_invoices WHERE id='invoice-preserve'").get().amount_paisa,10502);
});
