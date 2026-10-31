import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

const names = readdirSync("migrations").filter(f => /^\d{4}_.*\.sql$/.test(f)).sort();
const expected = [
  "0001_schema_tables.sql",
  "0002_schema_indexes.sql",
  "0003_domain_guards.sql",
  "0004_finance_reference.sql",
];
test("new development has four clean foundation migrations with one global Subject entity", () => {
  assert.deepEqual(names,expected);
  assert.equal(readdirSync("migrations").filter(f => /^\d{4}_.*\.sql$/.test(f)).length,4);
});
test("fresh canonical database has final domain schema and no historical records", () => {
  const db=new DatabaseSync(":memory:");
  try{
    db.exec("PRAGMA foreign_keys=ON");
    for (const file of names) db.exec(readFileSync("migrations/"+file,"utf8"));
    const tables=db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map(x=>x.name);
    for(const required of ["user","account","staff_memberships","staff_owner_setup","academy_students","academy_admissions","academy_batches","academy_offering_subjects","academic_subjects","finance_invoices","finance_payments","finance_operating_expenses","finance_journals","finance_payment_commands","finance_expense_command_keys"])
      assert(tables.includes(required),required);
    assert.equal(tables.filter(name=>/_pre_0029$/.test(name)).length,0,"no old student lifecycle snapshots");
    assert(!tables.includes("academy_subjects"),"old per-class subject table removed");
    assert.equal(db.prepare("SELECT count(*) n FROM public_programme_offerings").get().n,0);
    assert.equal(db.prepare("SELECT count(*) n FROM academy_offering_subjects").get().n,0);
    for(const name of ["user","staff_memberships","academy_students","academy_admissions","academy_batches","finance_invoices","finance_payments","finance_operating_expenses","finance_journals"])
      assert.equal(db.prepare('SELECT count(*) n FROM "'+name+'"').get().n,0,name);
    assert(db.prepare("SELECT count(*) n FROM finance_accounts").get().n>=5);
    db.exec(readFileSync("seeds/dev-reference.sql","utf8"));
    assert.equal(db.prepare("SELECT count(*) n FROM academy_classes").get().n,12);
    assert.equal(db.prepare("SELECT count(*) n FROM academy_guardian_relationships").get().n,27);
    assert(db.prepare("SELECT count(*) n FROM academic_subjects").get().n>=20);
    assert.equal(db.prepare("SELECT count(*) n FROM academy_offering_subjects").get().n,0);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
    // One-time first-owner ticket exists as a schema contract, not as a seeded identity.
    assert.equal(db.prepare("SELECT count(*) n FROM staff_owner_setup").get().n,0);
    const token="a".repeat(64);
    db.prepare("INSERT INTO staff_owner_setup(id,email,display_name,token,expires_at) VALUES('first-owner','dev-owner@example.invalid','Test Owner',?,strftime('%Y-%m-%dT%H:%M:%fZ','now','+30 minutes'))").run(token);
    assert.equal(db.prepare("SELECT count(*) n FROM staff_owner_setup").get().n,1);
  }finally{db.close();}
});
