import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync,existsSync} from "node:fs";
import {test} from "node:test";
import {dailyWorkSql} from "../lib/daily-work-sql.ts";

function database(){
 const db=new DatabaseSync(":memory:");
 db.exec("PRAGMA foreign_keys=ON");
 for(const name of readdirSync("migrations").filter(x=>/^\d{4}_.*\.sql$/.test(x)).sort())
  db.exec(readFileSync("migrations/"+name,"utf8"));
 return db;
}
function count(db,sql,...args){return db.prepare(sql).get(...args).n;}

test("Today's work queues use full-register counts, never recent record limits",()=>{
 const db=database();
 try{
  const add=db.prepare("INSERT INTO public_enquiries(id,reference,intent,student_name,class_name,guardian_name,mobile,consent_at,status) VALUES(?,?,?,?,?,?,?,?,?)");
  for(let i=0;i<261;i++)
   add.run("enquiry-"+i,"ENQ-"+i,"interest","Synthetic Student","Class 8","Synthetic Guardian","01700000000","2026-10-31T08:00:00Z","NEW");
  assert.equal(count(db,dailyWorkSql.enquiries),261);
  db.prepare("UPDATE public_enquiries SET status='CONTACTED' WHERE id='enquiry-0'").run();
  assert.equal(count(db,dailyWorkSql.enquiries),260);
  db.prepare("INSERT INTO academy_prospects(id,status,next_follow_up_at) VALUES(?,? ,date('now','+6 hours','-1 day'))")
    .run("enquiry-0","CONTACTED");
  assert.equal(count(db,dailyWorkSql.followups),1);
  db.prepare("UPDATE academy_prospects SET status='LOST' WHERE id='enquiry-0'").run();
  assert.equal(count(db,dailyWorkSql.followups),0);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
 }finally{db.close();}
});

test("No phantom tasks are invented in an empty coaching centre",()=>{
 const db=database();
 try{
  for(const [key,sql] of Object.entries(dailyWorkSql)){
   if(key==="teacherSessionsToday")continue;
   assert.equal(count(db,sql),0,key);
  }
  assert.equal(count(db,dailyWorkSql.teacherSessionsToday,"missing-user","missing-user"),0);
 }finally{db.close();}
});

test("Today and legacy action-center deep links resolve to implemented, permission-scoped tasks",()=>{
 const daily=readFileSync("modules/dashboard/daily-work-queries.ts","utf8");
 const page=readFileSync("app/dashboard/today/page.tsx","utf8");
 const panel=readFileSync("components/dashboard/daily-work-panel.tsx","utf8");
 const dashboard=readFileSync("app/dashboard/page.tsx","utf8");
 const registry=readFileSync("modules/platform/navigation/erp-route-registry.ts","utf8");
 assert(existsSync("app/dashboard/today/page.tsx"));
 assert.match(page,/requirePermission\("dashboard\.view"\)/);
 assert.match(page,/getDailyWorkOverview/);
 assert.match(daily,/can\(context,"finance.view"\)/);
 assert.match(daily,/can\(context,"crm.prospects.view"\)/);
 assert.match(daily,/teacherOnly/);
 assert.match(daily,/context\.profileId/);
 assert.match(panel,/Full-register counts/);
 assert.match(panel,/work\.queues\.map/);
 assert.match(dashboard,/<DailyWorkPanel work=\{daily\}/);
 assert.match(registry,/href: "\/dashboard\/today"/);
 assert.match(registry,/"\/dashboard\/today"/);
 const redirect=readFileSync("app/dashboard/action-center/page.tsx","utf8");
 assert.match(redirect,/redirect\("\/dashboard\/today"\)/);
 for(const route of ["/dashboard/admissions","/dashboard/crm/prospects",
  "/dashboard/finance/receivables","/dashboard/academics/batches","/dashboard/academics/routine"])
  assert(existsSync("app"+route+"/page.tsx"),"Missing queue destination "+route);
});
