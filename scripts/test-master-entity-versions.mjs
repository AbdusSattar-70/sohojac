import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";
import {test} from "node:test";
import {manageMasterRecordSchema} from "../modules/crm/manage/schema.ts";

const cases=[
 {entity:"class",table:"academy_classes",create:"INSERT INTO academy_classes(id,code,name) VALUES(?,?,?)",col:"name"},
 {entity:"group",table:"academic_groups",create:"INSERT INTO academic_groups(id,code,name) VALUES(?,?,?)",col:"name"},
 {entity:"subject",table:"academic_subjects",create:"INSERT INTO academic_subjects(id,code,title) VALUES(?,?,?)",col:"title"},
 {entity:"program",table:"academy_programmes",create:"INSERT INTO academy_programmes(id,code,name) VALUES(?,?,?)",col:"name"},
 {entity:"lead_source",table:"academy_lead_sources",create:"INSERT INTO academy_lead_sources(id,code,name) VALUES(?,?,?)",col:"name"},
 {entity:"guardian_relationship",table:"academy_guardian_relationships",create:"INSERT INTO academy_guardian_relationships(id,code,name) VALUES(?,?,?)",col:"name"},
];
function database(){
 const db=new DatabaseSync(":memory:");
 db.exec("PRAGMA foreign_keys=ON");
 for(const filename of readdirSync("migrations").filter(x=>/^\d{4}_.*\.sql$/.test(x)).sort())
  db.exec(readFileSync("migrations/"+filename,"utf8"));
 return db;
}
for(const row of cases){
 test(row.entity+" master cannot lose a concurrent edit",()=>{
  const db=database();
  try{
   const id="44986818-1a44-4519-9451-4dfb4873a311";
   const input={entity:row.entity,id,code:"TEST",name:"Initial",isActive:true,reason:"Update master"};
   assert.equal(manageMasterRecordSchema.safeParse(input).success,false,"version is mandatory");
   assert.equal(manageMasterRecordSchema.safeParse({...input,expectedVersion:1}).success,true);
   db.prepare(row.create).run(id,"TEST","Initial");
   const update=db.prepare("UPDATE "+row.table+" SET "+row.col+"=?,version=version+1 WHERE id=? AND version=?");
   assert.equal(update.run("First edit",id,1).changes,1);
   assert.equal(update.run("Stale edit",id,1).changes,0);
   assert.deepEqual({...db.prepare("SELECT "+row.col+",version FROM "+row.table+" WHERE id=?").get(id)},
     {[row.col]:"First edit",version:2});
   db.prepare("UPDATE "+row.table+" SET "+row.col+"=? WHERE id=?").run("Other authorized writer",id);
   assert.equal(db.prepare("SELECT version FROM "+row.table+" WHERE id=?").get(id).version,3,
      "even an existing API without explicit revision increment must invalidate stale editors");
   assert.equal(update.run("Stale after external writer",id,2).changes,0);
   assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
  } finally {db.close();}
 });
}
test("school directory edits are version-guarded and global subjects remain one master",()=>{
 const db=database();
 try{
  const id="94986818-1a44-4519-9451-4dfb4873a311";
  db.prepare("INSERT INTO academy_schools(id,name) VALUES(?,?)").run(id,"School A");
  assert.equal(db.prepare("UPDATE academy_schools SET name=?,version=version+1 WHERE id=? AND version=?").run("School B",id,1).changes,1);
  assert.equal(db.prepare("UPDATE academy_schools SET name=?,version=version+1 WHERE id=? AND version=?").run("School C",id,1).changes,0);
  assert.equal(db.prepare("SELECT name FROM academy_schools WHERE id=?").get(id).name,"School B");
  assert.equal(db.prepare("PRAGMA table_info(academic_subjects)").all().filter(x=>x.name==="version").length,1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_schema WHERE name='academy_subjects'").get().n,0);
 }finally{db.close();}
});
test("all staff editor writers carry a version to the database and audit only confirmed writes",()=>{
 const q=readFileSync("modules/crm/manage/queries.ts","utf8");
 const editor=readFileSync("modules/crm/manage/components/master-data-workspace.tsx","utf8");
 const action=readFileSync("modules/crm/manage/actions.ts","utf8");
 const schema=readFileSync("modules/crm/manage/schema.ts","utf8");
 for(const table of cases.map(x=>x.table).concat(["academy_schools","academic_years"]))
  assert(q.includes("FROM "+table),"missing read model "+table);
 assert.match(editor,/expectedVersion: row\.version/);
 assert.match(editor,/\{isEdit && \(/);
 assert.match(schema,/value\.id && !value\.expectedVersion/);
 for(const fragment of ["UPDATE academy_classes SET","UPDATE academic_subjects SET",
   "UPDATE academy_programmes SET","UPDATE academy_schools SET"])
  assert(action.includes(fragment));
 assert.equal((action.match(/AND version=\?/g)??[]).length,5,
  "five action cases cover years/classes/subject/program/school; generic tables share a sixth guard");
 assert.match(action,/UPDATE "\+table\+" SET code=\?,name=\?,is_active=\?,version=version\+1 WHERE id=\? AND version=\?/);
 assert.match(action,/SELECT \?,\?,\?,\?,\?,\?,\?,\? WHERE changes\(\)=1/);
 assert.match(action,/system\.master_data\.manage/);
});
