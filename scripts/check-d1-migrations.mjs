import assert from "node:assert/strict";
import { readdirSync,readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
// Only the canonical development baseline. No production credentials or history.
const names=readdirSync("migrations").filter(x=>/^\d{4}_[a-z0-9_-]+\.sql$/.test(x)).sort();
assert.deepEqual(names,["0001_schema_tables.sql","0002_schema_indexes.sql","0003_domain_guards.sql","0004_finance_reference.sql"]);
const db=new DatabaseSync(":memory:");
try {
 db.exec("PRAGMA foreign_keys=ON");
 for(const name of names){
   const sql=readFileSync("migrations/"+name,"utf8");
   if(/\b(?:DROP\s+(?:TABLE|INDEX|VIEW|TRIGGER)|TRUNCATE|DELETE\s+FROM)\b/i.test(sql))throw Error("Destructive canonical SQL: "+name);
   db.exec(sql);
 }
 const tables=new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map(x=>x.name));
 for(const name of ["user","staff_owner_setup","academy_students","academy_admissions","finance_invoices","finance_payments","finance_accounts"])assert(tables.has(name),"Missing "+name);
 assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM academy_students").get().n,0);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM finance_payments").get().n,0);
 console.log("Four clean canonical development migrations validated in memory.");
}finally{db.close();}
