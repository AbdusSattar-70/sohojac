import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { after, beforeEach, test } from "node:test";

// Execute the real lifecycle functions and SQL against SQLite. Hooks place a
// competing committed write after preflight reads and before the D1 transaction.
// Runtime auth, cache and Zod boundaries are injected; no billing SQL is copied.
const source = await readFile(new URL("../modules/admissions/lifecycle.ts", import.meta.url), "utf8");
const executable = stripTypeScriptTypes(source, { mode: "strip" })
  .replace(/^import .*;\r?\n/gm, "")
  .replace(/\bexport (?=async function)/g, "");
const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE academy_admissions (
    id TEXT PRIMARY KEY, status TEXT, version INTEGER, offering_id TEXT,
    batch_id TEXT, student_id TEXT, student_full_name TEXT, guardian_full_name TEXT,
    guardian_mobile TEXT, class_grade INTEGER, school_name TEXT, fee_plan_id TEXT,
    consent_verified INTEGER, approved_by TEXT, verified_by TEXT, updated_at TEXT
  );
  CREATE TABLE academy_batches (id TEXT PRIMARY KEY, offering_id TEXT, status TEXT, capacity INTEGER);
  CREATE TABLE academy_enrollments (id TEXT PRIMARY KEY, batch_id TEXT, status TEXT);
  CREATE TABLE academy_admission_consents (admission_id TEXT PRIMARY KEY, identity_revision INTEGER,
    guardian_signed_on TEXT, student_signed INTEGER, physical_copy_reference TEXT);
  CREATE TABLE academy_admission_referrals (admission_id TEXT PRIMARY KEY, source TEXT, referrer_id TEXT, staff_id TEXT);
  CREATE TABLE academy_referrer_people (id TEXT, full_name TEXT, mobile TEXT, staff_id TEXT, is_active INTEGER);
  CREATE TABLE academy_staff (id TEXT, full_name TEXT, status TEXT);
  CREATE TABLE public_programme_offerings (id TEXT PRIMARY KEY, allowed_discount_percentages_json TEXT);
  CREATE TABLE academy_fee_plans (id TEXT PRIMARY KEY, offering_id TEXT, title TEXT,
    monthly_amount_paisa INTEGER, admission_amount_paisa INTEGER, active INTEGER);
  CREATE TABLE academy_admission_discounts (admission_id TEXT PRIMARY KEY, discount_percent INTEGER,
    discount_reason TEXT, recorded_by TEXT, updated_at TEXT);
  CREATE TABLE academy_admission_extra_charges (id TEXT PRIMARY KEY, request_id TEXT UNIQUE,
    admission_id TEXT, charge_type TEXT, name TEXT, amount_paisa INTEGER, is_active INTEGER DEFAULT 1,
    recorded_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE academy_student_number_sequence (seq INTEGER PRIMARY KEY AUTOINCREMENT, admission_id TEXT UNIQUE);
  CREATE TABLE academy_students (id TEXT PRIMARY KEY, student_no TEXT UNIQUE, full_name TEXT,
    class_grade INTEGER, guardian_name TEXT, guardian_mobile TEXT, school_name TEXT, status TEXT);
  CREATE TABLE academy_admission_bills (id TEXT PRIMARY KEY, admission_id TEXT UNIQUE, reference TEXT,
    monthly_amount_paisa INTEGER, admission_amount_paisa INTEGER, amount_paisa INTEGER, issue_on TEXT, issued_by TEXT);
  CREATE TABLE finance_invoices (id TEXT PRIMARY KEY, invoice_no TEXT, student_id TEXT, admission_id TEXT,
    issue_on TEXT, due_on TEXT, amount_paisa INTEGER, status TEXT, created_by TEXT);
  CREATE TABLE erp_audit_events (id TEXT PRIMARY KEY, entity_type TEXT, entity_id TEXT NOT NULL,
    action TEXT, actor_id TEXT, reason TEXT, after_json TEXT);
`);
const admissionId = "11111111-1111-4111-8111-111111111111";
const chargeId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
let beforeBatch = null;
const env = { DB: {
  prepare(sql) {
    let values = [];
    const query = {
      sql,
      get values() { return values; },
      bind(...args) { values = args; return query; },
      async first() { return db.prepare(sql).get(...values) ?? null; },
      async all() { return { results: db.prepare(sql).all(...values) }; },
    };
    return query;
  },
  async batch(statements) {
    const competingWrite = beforeBatch;
    beforeBatch = null;
    if (competingWrite) await competingWrite();
    db.exec("BEGIN");
    try {
      const results = statements.map(({ sql, values }) => {
        const rows = db.prepare(sql).all(...values);
        const changes = db.prepare("SELECT changes() AS n").get().n;
        return { results: rows, meta: { changes } };
      });
      db.exec("COMMIT");
      return results;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  },
} };
// Input parsing is an external boundary; these tests supply valid fixture data.
const schema = new Proxy(() => schema, { get(_, key) {
  if (key === "safeParse") return data => ({ success: true, data });
  if (key === "parse") return data => data;
  return schema;
} });
const permissions = ["admissions.create", "admissions.view", "finance.billing.manage"];
const actions = new Function("env", "z", "revalidatePath", "getErpContext", "requirePermission", `${executable}
  return { finalizeAdmission, saveExtraCharge, deactivateExtraCharge, saveAdmissionDiscount };`
)(env, schema, () => {}, async () => ({ profileId: "staff", permissions }), async () => ({ permissions }));
const finalize = () => actions.finalizeAdmission({ admissionId, requestId, reason: "Confirm verified admission fees" });
const discount = percent => actions.saveAdmissionDiscount({ admissionId, discountPercent: percent,
  discountReason: "Approved policy", reason: "Verified tuition discount" });
const addCharge = () => actions.saveExtraCharge({ admission_id: admissionId, request_id: requestId,
  name: "Materials", amount: 10, charge_type: "MATERIAL" });
function count(table) { return db.prepare(`SELECT count(*) AS n FROM ${table}`).get().n; }
function assertUnbilled() {
  assert.equal(db.prepare("SELECT status FROM academy_admissions").get().status, "REVIEW");
  for (const table of ["academy_student_number_sequence", "academy_students", "academy_admission_bills", "finance_invoices"]) {
    assert.equal(count(table), 0, `${table} must remain empty after a fee conflict`);
  }
  assert.equal(db.prepare("SELECT count(*) AS n FROM erp_audit_events WHERE action='FINALIZED_AND_BILLED'").get().n, 0);
}
beforeEach(() => {
  beforeBatch = null;
  for (const table of ["academy_admissions", "academy_batches", "academy_enrollments", "academy_admission_consents",
    "academy_admission_referrals", "public_programme_offerings", "academy_fee_plans", "academy_admission_discounts",
    "academy_admission_extra_charges", "academy_student_number_sequence", "academy_students", "academy_admission_bills",
    "finance_invoices", "erp_audit_events"]) db.exec(`DELETE FROM ${table}`);
  db.prepare("INSERT INTO academy_admissions VALUES (?, 'REVIEW', 2, 'offering', 'batch', NULL, 'Student', 'Guardian', '01700000000', 10, 'School', NULL, 1, NULL, NULL, NULL)").run(admissionId);
  db.exec(`INSERT INTO academy_batches VALUES ('batch', 'offering', 'ACTIVE', 12);
    INSERT INTO public_programme_offerings VALUES ('offering', '[10,20]');
    INSERT INTO academy_fee_plans VALUES ('plan', 'offering', 'Standard', 100000, 20000, 1);`);
  db.prepare("INSERT INTO academy_admission_consents VALUES (?, 2, '2026-10-29', 1, 'Paper file')").run(admissionId);
  db.prepare("INSERT INTO academy_admission_referrals VALUES (?, 'ORGANIC', NULL, NULL)").run(admissionId);
  db.prepare("INSERT INTO academy_admission_discounts VALUES (?, 10, 'Approved policy', 'staff', NULL)").run(admissionId);
  db.prepare("INSERT INTO academy_admission_extra_charges(id, request_id, admission_id, charge_type, name, amount_paisa, recorded_by) VALUES (?, 'initial', ?, 'MATERIAL', 'Initial materials', 5000, 'staff')").run(chargeId, admissionId);
});
after(() => db.close());

test("unchanged fee review finalizes once with exact money and retains consent", async () => {
  assert.equal((await finalize()).ok, true);
  assert.equal(db.prepare("SELECT amount_paisa FROM finance_invoices").get().amount_paisa, 115000);
  assert.equal(count("academy_students"), 1);
  assert.equal(count("erp_audit_events"), 1);
  assert.equal(db.prepare("SELECT identity_revision FROM academy_admission_consents").get().identity_revision, 2);
  assert.equal((await finalize()).ok, true);
  assert.equal(count("finance_invoices"), 1);
  assert.equal(count("erp_audit_events"), 1);
});

test("a charge committed after the review read rejects stale finalization with zero partial writes", async () => {
  beforeBatch = async () => assert.equal((await addCharge()).ok, true);
  assert.equal((await finalize()).ok, false);
  assertUnbilled();
  assert.equal(count("erp_audit_events"), 1);
  assert.equal((await finalize()).ok, true);
  assert.equal(db.prepare("SELECT amount_paisa FROM finance_invoices").get().amount_paisa, 116000);
});

test("charge removal committed after the review read rejects the stale higher total", async () => {
  beforeBatch = async () => assert.equal((await actions.deactivateExtraCharge(admissionId, chargeId)).ok, true);
  assert.equal((await finalize()).ok, false);
  assertUnbilled();
  assert.equal((await finalize()).ok, true);
  assert.equal(db.prepare("SELECT amount_paisa FROM finance_invoices").get().amount_paisa, 110000);
});

test("a concurrent discount save rejects the stale total without invalidating signed identity", async () => {
  beforeBatch = async () => assert.equal((await discount(20)).ok, true);
  assert.equal((await finalize()).ok, false);
  assertUnbilled();
  assert.equal(db.prepare("SELECT version FROM academy_admissions").get().version, 2);
  assert.equal((await finalize()).ok, true);
  assert.equal(db.prepare("SELECT amount_paisa FROM finance_invoices").get().amount_paisa, 105000);
});

test("a changed discount policy blocks both stale discount saves and finalization", async () => {
  beforeBatch = () => db.exec("UPDATE public_programme_offerings SET allowed_discount_percentages_json='[]'");
  assert.equal((await discount(20)).ok, false);
  assert.equal(count("erp_audit_events"), 0);
  db.exec("UPDATE public_programme_offerings SET allowed_discount_percentages_json='[10,20]'");
  beforeBatch = () => db.exec("UPDATE public_programme_offerings SET allowed_discount_percentages_json='[]'");
  assert.equal((await finalize()).ok, false);
  assertUnbilled();
});

test("a newer active fee plan or a price edit invalidates an already read review", async () => {
  beforeBatch = () => db.exec("INSERT INTO academy_fee_plans VALUES ('new-plan', 'offering', 'New standard', 200000, 30000, 1)");
  assert.equal((await finalize()).ok, false);
  assertUnbilled();
  beforeBatch = () => db.exec("UPDATE academy_fee_plans SET monthly_amount_paisa=300000 WHERE id='new-plan'");
  assert.equal((await finalize()).ok, false);
  assertUnbilled();
});

test("a case revision change blocks each stale fee mutation without ghost audit events", async () => {
  for (const action of [addCharge, () => discount(20), () => actions.deactivateExtraCharge(admissionId, chargeId)]) {
    beforeBatch = () => db.exec("UPDATE academy_admissions SET version=version+1");
    assert.equal((await action()).ok, false);
    assert.equal(count("erp_audit_events"), 0);
  }
  assert.equal(count("academy_admission_extra_charges"), 1);
  assert.equal(db.prepare("SELECT is_active FROM academy_admission_extra_charges").get().is_active, 1);
  assert.equal(db.prepare("SELECT discount_percent FROM academy_admission_discounts").get().discount_percent, 10);
});

test("finalization winning the race blocks late fee changes without audit writes", async () => {
  beforeBatch = async () => assert.equal((await finalize()).ok, true);
  assert.equal((await addCharge()).ok, false);
  assert.equal(count("academy_admission_extra_charges"), 1);
  assert.equal((await discount(20)).ok, false);
  assert.equal((await actions.deactivateExtraCharge(admissionId, chargeId)).ok, false);
  assert.equal(count("erp_audit_events"), 1);
  assert.equal(db.prepare("SELECT amount_paisa FROM finance_invoices").get().amount_paisa, 115000);
});

test("replayed charge creation and deactivation never duplicate a charge or audit", async () => {
  assert.equal((await addCharge()).ok, true);
  assert.equal((await addCharge()).ok, true);
  assert.equal(count("academy_admission_extra_charges"), 2);
  assert.equal(count("erp_audit_events"), 1);
  assert.equal((await actions.deactivateExtraCharge(admissionId, chargeId)).ok, true);
  assert.equal((await actions.deactivateExtraCharge(admissionId, chargeId)).ok, false);
  assert.equal(count("erp_audit_events"), 2);
});

test("concurrent retries of one charge recover the committed request without duplication", async () => {
  beforeBatch = async () => assert.equal((await addCharge()).ok, true);
  assert.equal((await addCharge()).ok, true);
  assert.equal(count("academy_admission_extra_charges"), 2);
  assert.equal(count("erp_audit_events"), 1);
});

test("invoice trigger effects preserve the direct-write audit gate", async () => {
  db.exec(`CREATE TABLE trigger_effects (id TEXT);
    CREATE TRIGGER test_invoice_effects AFTER INSERT ON finance_invoices BEGIN
      INSERT INTO trigger_effects VALUES (NEW.id);
      INSERT INTO trigger_effects VALUES (NEW.id);
    END;`);
  try {
    assert.equal((await finalize()).ok, true);
    assert.equal(count("trigger_effects"), 2);
    assert.equal(count("erp_audit_events"), 1);
  } finally {
    db.exec("DROP TRIGGER test_invoice_effects; DROP TABLE trigger_effects");
  }
});

test("a ledger constraint failure rolls back the complete finalization transaction", async () => {
  db.exec(`CREATE TRIGGER test_invoice_failure BEFORE INSERT ON finance_invoices BEGIN
    SELECT RAISE(ABORT, 'Simulated ledger rejection');
  END;`);
  try {
    assert.equal((await finalize()).ok, false);
    assertUnbilled();
    assert.equal(count("erp_audit_events"), 0);
  } finally {
    db.exec("DROP TRIGGER test_invoice_failure");
  }
});
