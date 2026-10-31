import assert from "node:assert/strict";
import { readFileSync,readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import {
  legacyOfferingImpactSql, assessmentSubjectLabelsSql, teachingReferenceCountsSql,
  globalSubjectDirectorySql,
} from "../lib/subject-directory-sql.ts";

function fresh() {
 const db=new DatabaseSync(":memory:");
 db.exec("PRAGMA foreign_keys=ON");
 for(const file of readdirSync("migrations").filter(x=>/^\d{4}_.+\.sql$/.test(x)).sort())
   db.exec(readFileSync("migrations/"+file,"utf8"));
 db.exec(readFileSync("seeds/dev-reference.sql","utf8"));
 return db;
}

test("impact inventory lists original IDs, exact public-card snapshots and all offering links without modifying any rows",()=>{
 const db=fresh();
 try {
  db.prepare("INSERT INTO academy_subjects(id,code,name,class_grade,group_name) VALUES(?,?,?,?,?)")
    .run("legacy-BAN-8","BAN","Bangla",8,"GENERAL");
  db.prepare("INSERT INTO academy_subjects(id,code,name,class_grade,group_name) VALUES(?,?,?,?,?)")
    .run("legacy-BAN-10","BAN","Bangla",10,"GENERAL");
  db.prepare("INSERT INTO public_programme_offerings(id,code,name,show_on_website,is_active) VALUES(?,?,?,?,?)")
    .run("offering-8","PREP8","Class 8 readiness",1,1);
  db.prepare("INSERT INTO public_programme_offerings(id,code,name,show_on_website,is_active) VALUES(?,?,?,?,?)")
    .run("offering-10","PREP10","Class 10 readiness",0,0);
  for(const [offering,subject] of [["offering-8","legacy-BAN-8"],["offering-10","legacy-BAN-10"]])
    db.prepare("INSERT INTO academy_offering_subjects(offering_id,subject_id) VALUES(?,?)").run(offering,subject);
  const before=db.prepare("SELECT id,subjects_json,version FROM public_programme_offerings ORDER BY id").all();
  const globalBefore=db.prepare(globalSubjectDirectorySql).all();
  const links=db.prepare(legacyOfferingImpactSql).all();
  assert.equal(links.length,2);
  assert.deepEqual(links.map(x=>x.legacySubjectId).sort(),["legacy-BAN-10","legacy-BAN-8"].sort());
  assert.equal(links.find(x=>x.offeringId==="offering-8").publicVisible,1);
  assert.equal(links.find(x=>x.offeringId==="offering-8").snapshotContainsLegacyId,1);
  assert.equal(links.find(x=>x.offeringId==="offering-10").publicVisible,0);
  assert.deepEqual(db.prepare("SELECT id,subjects_json,version FROM public_programme_offerings ORDER BY id").all(),before);
  assert.deepEqual(db.prepare(globalSubjectDirectorySql).all(),globalBefore);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
 }finally{db.close();}
});

test("assessment text and teaching session counts remain unmapped and preserve original records",()=>{
 const db=fresh();
 try{
  assert.deepEqual(db.prepare(assessmentSubjectLabelsSql).all(),[]);
  assert.deepEqual(db.prepare(teachingReferenceCountsSql).get(),{assessments:0,sessions:0});
  db.prepare('INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES(?,?,?,?,?)')
    .run("test-teacher","Synthetic Teacher","synthetic@example.invalid",1,1);
  db.prepare("INSERT INTO public_programme_offerings(id,code,name) VALUES(?,?,?)")
    .run("offering-a","OFF-A","Sample offering");
  db.prepare("INSERT INTO academy_batches(id,code,name,offering_id,capacity) VALUES(?,?,?,?,?)")
    .run("batch-a","BATCH-A","Sample batch","offering-a",12);
  db.prepare("INSERT INTO academy_assessments(id,batch_id,title,subject,held_on,max_marks,created_by) VALUES(?,?,?,?,?,?,?)")
    .run("assessment-a","batch-a","Term test","Bangla","2026-10-30",100,"test-teacher");
  const snapshot=db.prepare("SELECT id,subject FROM academy_assessments").all();
  assert.deepEqual(db.prepare(assessmentSubjectLabelsSql).all(),[{
    subjectLabel:"Bangla",assessmentCount:1,affectedBatches:1,earliestDate:"2026-10-30",latestDate:"2026-10-30",
  }]);
  assert.deepEqual(db.prepare(teachingReferenceCountsSql).get(),{assessments:1,sessions:0});
  assert.deepEqual(db.prepare("SELECT id,subject FROM academy_assessments").all(),snapshot);
 }finally{db.close();}
});

test("C2b is permissioned, no migration or inferred rekey, and visible on the staff subject workspace",()=>{
 const q=readFileSync("modules/academics/subjects/queries.ts","utf8");
 const page=readFileSync("app/dashboard/academics/subjects/page.tsx","utf8");
 assert.match(q,/requirePermission\("system\.master_data\.manage"\)/);
 for(const name of ["legacyOfferingImpactSql","assessmentSubjectLabelsSql","teachingReferenceCountsSql"])
  assert.match(q,new RegExp(name));
 assert.doesNotMatch(q,/INSERT INTO|DELETE FROM|UPDATE academy_subjects/);
 assert.match(page,/data-subject-impact-review/);
 assert.match(page,/data-assessment-label-audit/);
 assert.match(page,/Identity mapping not approved/);
 assert.match(page,/Original subject ID/);
 const sql=readFileSync("lib/subject-directory-sql.ts","utf8");
 assert.doesNotMatch(sql,/UPDATE\s|INSERT\s|DELETE\s|DROP\s/i);
});
