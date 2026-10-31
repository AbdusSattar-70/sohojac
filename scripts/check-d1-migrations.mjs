import assert from "node:assert/strict";
import { readdirSync,readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
// Only the canonical development baseline. No production credentials or history.
const names=readdirSync("migrations").filter(x=>/^\d{4}_[a-z0-9_-]+\.sql$/.test(x)).sort();
assert.deepEqual(names,["0001_schema_tables.sql","0002_schema_indexes.sql","0003_domain_guards.sql","0004_finance_reference.sql","0005_single_global_subject.sql"]);
const db=new DatabaseSync(":memory:");
try {
 db.exec("PRAGMA foreign_keys=ON");
 for(const name of names){
   const sql=readFileSync("migrations/"+name,"utf8");
   // Reviewed development-only removal: no production changes or business-record wipes.
   if(name!=="0005_single_global_subject.sql" && /\b(?:DROP\s+(?:TABLE|INDEX|VIEW|TRIGGER|COLUMN)|TRUNCATE|DELETE\s+FROM)\b/i.test(sql))throw Error("Destructive baseline SQL: "+name);
   if(name==="0005_single_global_subject.sql") {
     assert.match(sql,/DROP TABLE academy_offering_subjects;/);
     assert.match(sql,/DROP TABLE academy_subjects;/);
     assert.match(sql,/REFERENCES academic_subjects\(id\)/);
     assert.doesNotMatch(sql,/DROP TABLE (?:academy_students|academy_admissions|finance_|user)/);
   }
   db.exec(sql);
 }
 const tables=new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map(x=>x.name));
 for(const name of ["user","staff_owner_setup","academic_subjects","academy_offering_subjects","academy_students","academy_admissions","finance_invoices","finance_payments","finance_accounts"])assert(tables.has(name),"Missing "+name);
 assert(!tables.has("academy_subjects"),"Obsolete class-specific subject table must be absent");
 const subjectColumns=db.prepare("PRAGMA table_info(academic_subjects)").all().map(x=>x.name);
 assert(!subjectColumns.includes("class_grade")&&!subjectColumns.includes("group_name"));
 assert(db.prepare("PRAGMA foreign_key_list(academy_offering_subjects)").all().some(x=>x.table==="academic_subjects"));
 assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM academy_students").get().n,0);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM finance_payments").get().n,0);
 console.log("Five forward-only development migrations verified with a single reusable subject master.");
}finally{db.close();}
