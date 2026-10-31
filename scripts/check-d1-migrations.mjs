import assert from "node:assert/strict";
import {readdirSync,readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
// Fresh development has four clean source migrations; no legacy subject schema.
const names=readdirSync("migrations").filter(x=>/^\d{4}_[a-z0-9_-]+\.sql$/.test(x)).sort();
assert.deepEqual(names,["0001_schema_tables.sql","0002_schema_indexes.sql","0003_domain_guards.sql","0004_finance_reference.sql","0005_master_versions.sql","0006_guardian_message_outbox.sql","0007_guardian_sms_optout.sql","0008_guardian_contact_suppression.sql"]);
const db=new DatabaseSync(":memory:");
try{
  db.exec("PRAGMA foreign_keys=ON");
  for(const name of names){
    const sql=readFileSync("migrations/"+name,"utf8");
    assert.doesNotMatch(sql,/\b(?:DROP\s+(?:TABLE|INDEX|VIEW|TRIGGER|COLUMN)|TRUNCATE|DELETE\s+FROM)\b/i, "Found destructive SQL in "+name);
    assert.doesNotMatch(sql,/\bacademy_subjects\b/i, "Retired master is forbidden in migrations: "+name);
    db.exec(sql);
  }
  const tables=new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map(r=>r.name));
  for(const table of ["user","staff_owner_setup","academic_subjects","academy_offering_subjects","academy_students","academy_admissions","finance_invoices","finance_payments","finance_accounts"])
    assert(tables.has(table),"Missing table "+table);
  assert(!tables.has("academy_subjects"));
  assert(tables.has("guardian_message_outbox"));
  assert(tables.has("guardian_sms_optouts"));
  assert(tables.has("guardian_sms_contact_suppressions"));
  assert.deepEqual(db.prepare("PRAGMA table_info(academic_subjects)").all().map(r=>r.name),["id","code","title","active","version"]);
  for(const table of ["academy_classes","academic_groups","academic_subjects","academy_programmes","academy_schools","academy_lead_sources","academy_guardian_relationships"])
    assert(db.prepare("PRAGMA table_info("+table+")").all().some(r=>r.name==="version"),"Missing version on "+table);
  assert(db.prepare("PRAGMA foreign_key_list(academy_offering_subjects)").all().some(r=>r.table==="academic_subjects"&&r.from==="subject_id"));
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM academy_students").get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM finance_payments").get().n,0);
  console.log("Eight forward-only development migrations: global Subject and concurrency-protected academic master data.");
}finally{db.close();}
