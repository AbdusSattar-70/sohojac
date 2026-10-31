import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {test} from "node:test";
import {manageMasterRecordSchema} from "../modules/crm/manage/schema.ts";

function fresh(){
 const db=new DatabaseSync(":memory:");
 db.exec("PRAGMA foreign_keys=ON");
 for(const file of readdirSync("migrations").filter(x=>/^\d{4}_.+\.sql$/.test(x)).sort())
  db.exec(readFileSync("migrations/"+file,"utf8"));
 return db;
}

const year={
 entity:"academic_year",id:"9a1444a3-3b7b-49be-8e1e-b0e536f02955",name:"2027",
 code:"",isActive:true,isVerified:false,
 startsOn:"2027-01-01",endsOn:"2027-12-31",reason:"Planning update"
};
test("academic-year edits require a revision but fresh creates do not",()=>{
 assert.equal(manageMasterRecordSchema.safeParse({...year,expectedVersion:1}).success,true);
 assert.equal(manageMasterRecordSchema.safeParse(year).success,false);
 assert.equal(manageMasterRecordSchema.safeParse({...year,expectedVersion:0}).success,false);
 assert.equal(manageMasterRecordSchema.safeParse({...year,id:""}).success,true);
});
test("two staff editors carrying the same version cannot silently overwrite",()=>{
 const db=fresh();
 try{
  db.prepare("INSERT INTO academic_years(id,code,title,starts_on,ends_on,status) VALUES(?,?,?,?,?,'ACTIVE')")
   .run(year.id,"YR-27","Year 2027","2027-01-01","2027-12-31");
  const initial=db.prepare("SELECT version FROM academic_years WHERE id=?").get(year.id).version;
  assert.equal(initial,1);
  const save=db.prepare("UPDATE academic_years SET title=?,version=version+1 WHERE id=? AND version=?");
  assert.equal(save.run("First operator",year.id,initial).changes,1);
  assert.equal(save.run("Stale operator",year.id,initial).changes,0);
  assert.deepEqual({...db.prepare("SELECT title,version FROM academic_years WHERE id=?").get(year.id)},
    {title:"First operator",version:2});
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
 }finally{db.close();}
});
test("Academic Setup propagates version and Server Action uses a CAS guard and named permission",()=>{
 const schema=readFileSync("modules/crm/manage/schema.ts","utf8");
 const q=readFileSync("modules/crm/manage/queries.ts","utf8");
 const ui=readFileSync("modules/crm/manage/components/master-data-workspace.tsx","utf8");
 const action=readFileSync("modules/crm/manage/actions.ts","utf8");
 assert.match(schema,/expectedVersion/);
 assert.match(q,/created_at,version FROM academic_years/);
 assert.match(ui,/expectedVersion: entity === "academic_year"/);
 assert.match(ui,/register\("expectedVersion"/);
 assert.match(action,/WHERE id=\? AND version=\?/);
 assert.match(action,/v\.expectedVersion/);
 assert.match(action,/system\.master_data\.manage/);
 assert.match(action,/WHERE changes\(\)=1/);
});
