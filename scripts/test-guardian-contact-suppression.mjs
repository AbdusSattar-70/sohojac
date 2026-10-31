import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readdirSync,readFileSync} from "node:fs";

const migrations=readdirSync("migrations").filter(x=>/^\d{4}_.+\.sql$/.test(x)).sort();
function fresh(stop=8){
 const db=new DatabaseSync(":memory:");
 db.exec("PRAGMA foreign_keys=ON");
 for(const file of migrations.slice(0,stop))db.exec(readFileSync("migrations/"+file,"utf8"));
 db.prepare('INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES(?,?,?,?,?)')
   .run("staff-a","Synthetic staff","test-staff@example.invalid",1,1);
 return db;
}
function student(db,id,number,phone){
 db.prepare("INSERT INTO academy_students(id,student_no,full_name,guardian_name,guardian_mobile) VALUES(?,?,?,?,?)")
  .run(id,number,"Synthetic learner","Synthetic guardian",phone);
}
function hold(db,id,studentId,requestId){
 return db.prepare("INSERT INTO guardian_message_outbox(id,request_id,student_id,template_key,consent_attested,created_by) VALUES(?,?,?,?,1,?)")
  .run(id,requestId,studentId,"GENERAL_REMINDER","staff-a");
}
const uuid1="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const uuid2="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
test("existing student opt-out backfills to contact, cancels held sibling requests and rejects new inserts",()=>{
 const db=fresh(7);
 try{
  student(db,"child-a","SA-STD-A","01711111111");
  student(db,"child-b","SA-STD-B","01711111111");
  hold(db,"held-before","child-b",uuid1);
  db.prepare("INSERT INTO guardian_sms_optouts(student_id,reason,recorded_by) VALUES(?,?,?)")
   .run("child-a","Guardian withdrew permission","staff-a");
  assert.equal(db.prepare("SELECT status FROM guardian_message_outbox WHERE id='held-before'").get().status,"HELD");
  db.exec(readFileSync("migrations/0008_guardian_contact_suppression.sql","utf8"));
  assert.equal(db.prepare("SELECT COUNT(*) n FROM guardian_sms_contact_suppressions").get().n,1);
  assert.equal(db.prepare("SELECT status FROM guardian_message_outbox WHERE id='held-before'").get().status,"CANCELLED");
  assert.equal(db.prepare("SELECT cancelled_by FROM guardian_message_outbox WHERE id='held-before'").get().cancelled_by,"staff-a");
  assert.throws(()=>hold(db,"held-after","child-b",uuid2),/guardian_sms_contact_opted_out/);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
 }finally{db.close();}
});
test("new refusal cancels all siblings, has audit and cannot be edited or deleted",()=>{
 const db=fresh();
 try{
  student(db,"child-a","SA-STD-A","01722222222");
  student(db,"child-b","SA-STD-B","01722222222");
  hold(db,"held-a","child-a",uuid1);
  hold(db,"held-b","child-b",uuid2);
  db.prepare("INSERT INTO guardian_sms_contact_suppressions(guardian_mobile,source_student_id,reason,recorded_by) VALUES(?,?,?,?)")
   .run("01722222222","child-a","No SMS for this guardian","staff-a");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM guardian_message_outbox WHERE status='HELD'").get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM erp_audit_events WHERE action='OPTOUT' AND entity_type='guardian_sms_contact'").get().n,1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM erp_audit_events WHERE action='CANCELLED' AND entity_type='guardian_message'").get().n,2);
  assert.throws(()=>db.prepare("DELETE FROM guardian_sms_contact_suppressions").run(),/guardian_contact_optout_is_immutable/);
  assert.throws(()=>db.prepare("UPDATE guardian_sms_contact_suppressions SET reason='changed'").run(),/guardian_contact_optout_is_immutable/);
  assert.throws(()=>hold(db,"held-c","child-a","cccccccc-cccc-4ccc-8ccc-cccccccccccc"),/guardian_sms_contact_opted_out/);
 }finally{db.close();}
});
test("changing guardian mobile cancels held request rather than silently retargeting",()=>{
 const db=fresh();
 try{
  student(db,"child-a","SA-STD-A","01733333333");
  hold(db,"held-a","child-a",uuid1);
  db.prepare("UPDATE academy_students SET guardian_mobile=? WHERE id=?")
   .run("01744444444","child-a");
  const row=db.prepare("SELECT status,cancel_reason FROM guardian_message_outbox WHERE id='held-a'").get();
  assert.equal(row.status,"CANCELLED");
  assert.equal(row.cancel_reason,"Guardian contact changed");
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
 }finally{db.close();}
});
test("contact identity stays server-side and staff hold uses explicit consent + retry identity",()=>{
 const route=readFileSync("app/api/staff/messages/route.ts","utf8");
 const page=readFileSync("app/dashboard/governance/messages/page.tsx","utf8");
 const client=readFileSync("modules/communications/message-safety-workspace.tsx","utf8");
 const optOut=readFileSync("app/api/staff/messages/opt-out/route.ts","utf8");
 assert.match(route,/guardian_sms_contact_suppressions/);
 assert.match(route,/consentAttested/);
 assert.match(optOut,/guardian_sms_contact_suppressions/);
 assert.match(optOut,/communications\.manage/);
 assert.match(client,/holdRequestId/);
 assert.match(client,/Hold request \(do not send\)/);
 assert.match(client,/consentAttested:true/);
 assert.doesNotMatch(page,/SELECT\\s+(?:o|s)\\.guardian_mobile/);
 assert.doesNotMatch(client,/guardian_mobile/);
 for(const path of ["app/api/staff/messages/route.ts","app/api/staff/messages/opt-out/route.ts"]){
  assert.doesNotMatch(readFileSync(path,"utf8"),/\.sendSMS\s*\(|\.sendSms\s*\(/);
 }
});
