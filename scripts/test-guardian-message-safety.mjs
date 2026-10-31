import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readdirSync,readFileSync} from "node:fs";

function setup(){
 const db=new DatabaseSync(":memory:");
 db.exec("PRAGMA foreign_keys=ON");
 for(const name of readdirSync("migrations").filter(x=>/^\d{4}_.+\.sql$/.test(x)).sort())
  db.exec(readFileSync("migrations/"+name,"utf8"));
 db.prepare('INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES(?,?,?,?,?)')
  .run("staff-test","Test Owner","staff@example.invalid",1,1);
 db.prepare("INSERT INTO academy_students(id,student_no,full_name,guardian_name,guardian_mobile) VALUES(?,?,?,?,?)")
  .run("student-test","SA-STD-00001","Test Student","Test Guardian","01712345678");
 return db;
}
test("a guardian opt-out blocks new held messages and cannot be silently erased",()=>{
 const db=setup();
 try{
  const put=()=>db.prepare("INSERT INTO guardian_message_outbox(id,request_id,student_id,template_key,consent_attested,created_by) VALUES(?,?,?,?,1,?)");
  put().run("request-1","11111111-1111-1111-1111-111111111111","student-test","GENERAL_REMINDER","staff-test");
  db.prepare("INSERT INTO guardian_sms_optouts(student_id,reason,recorded_by) VALUES(?,?,?)")
   .run("student-test","Guardian does not consent","staff-test");
  assert.throws(()=>put().run("request-2","22222222-2222-2222-2222-222222222222",
   "student-test","GENERAL_REMINDER","staff-test"),/guardian_sms_opted_out/);
  assert.throws(()=>db.prepare("DELETE FROM guardian_sms_optouts").run(),/sms_optout_is_immutable/);
  assert.throws(()=>db.prepare("UPDATE guardian_sms_optouts SET reason='change'").run(),/sms_optout_is_immutable/);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
 }finally{db.close();}
});
test("held cancellations persist actor, reason and do not record delivery",()=>{
 const db=setup();
 try{
  db.prepare("INSERT INTO guardian_message_outbox(id,request_id,student_id,template_key,consent_attested,created_by) VALUES(?,?,?,?,1,?)")
   .run("request-1","11111111-1111-1111-1111-111111111111","student-test","ADMISSION_FOLLOWUP","staff-test");
  const result=db.prepare("UPDATE guardian_message_outbox SET status='CANCELLED',cancelled_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),cancelled_by=?,cancel_reason=? WHERE id=? AND status='HELD'")
   .run("staff-test","Cancelled by staff before dispatch","request-1");
  assert.equal(result.changes,1);
  assert.equal(db.prepare("SELECT status FROM guardian_message_outbox WHERE id='request-1'").get().status,"CANCELLED");
  assert.equal(db.prepare("SELECT cancelled_by FROM guardian_message_outbox WHERE id='request-1'").get().cancelled_by,"staff-test");
  assert.equal(db.prepare("UPDATE guardian_message_outbox SET status='CANCELLED' WHERE id='request-1' AND status='HELD'").run().changes,0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM guardian_message_outbox WHERE status='HELD'").get().n,0);
 }finally{db.close();}
});
test("permission, origin and stop-delivery guarantees apply to every message mutation",()=>{
 const files=["app/api/staff/messages/route.ts",
 "app/api/staff/messages/opt-out/route.ts",
 "app/api/staff/messages/[id]/cancel/route.ts"];
 for(const path of files){
  const code=readFileSync(path,"utf8");
  assert.match(code,/communications\.manage/);
  assert.match(code,/sameOrigin/);
  assert.doesNotMatch(code,/fetch\s*\(|\.sendSMS\s*\(|\.sendSms\s*\(/);
 }
 const posting=readFileSync(files[0],"utf8");
 assert.match(posting,/guardian_sms_optouts/);
 const optout=readFileSync(files[1],"utf8");
 assert.match(optout,/UPDATE guardian_message_outbox SET status='CANCELLED'/);
 assert.match(optout,/erp_audit_events/);
 const cancel=readFileSync(files[2],"utf8");
 assert.match(cancel,/WHERE id=\? AND status='HELD'/);
 const view=readFileSync("app/dashboard/governance/messages/page.tsx","utf8");
 assert.match(view,/requirePermission\("audit.view"\)/);
 assert.doesNotMatch(view,/guardian_mobile/);
});
