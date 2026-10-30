import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {stripTypeScriptTypes} from "node:module";
import {DatabaseSync} from "node:sqlite";
import {beforeEach,after,test} from "node:test";
import {z} from "zod";

const uid="11111111-1111-4111-8111-111111111111",other="66666666-6666-4666-8666-666666666666";
const branch="22222222-2222-4222-8222-222222222222",year="33333333-3333-4333-8333-333333333333";
const grade="44444444-4444-4444-8444-444444444444",programme="55555555-5555-4555-8555-555555555555";
const uuid=()=>crypto.randomUUID();
let db,permissions,profileId,authenticated,origin,sqlRead,beforeBatch,afterReplayRead;
async function first(sql,values=[]){const result=db.prepare(sql).get(...values)??null;if(afterReplayRead&&sql.includes("FROM academy_offering_command_keys")){const hook=afterReplayRead;afterReplayRead=null;await hook();}return result;}
const env={DB:{prepare(sql){sqlRead.push(sql);const prepared={sql,values:[],bind(...values){return {...prepared,values,async first(){return first(sql,values);},async all(){return {results:db.prepare(sql).all(...values)};}};},async first(){return first(sql);},async all(){return {results:db.prepare(sql).all()};}};return prepared;},async batch(statements){
 if(beforeBatch){const f=beforeBatch;beforeBatch=null;await f();}
 db.exec("BEGIN");try{const result=statements.map(s=>({results:db.prepare(s.sql).all(...s.values),meta:{changes:db.prepare("SELECT changes() AS n").get().n}}));db.exec("COMMIT");return result;}catch(error){db.exec("ROLLBACK");throw error;}
}}};
function executable(file){return stripTypeScriptTypes(fs.readFileSync(new URL("../"+file,import.meta.url),"utf8"),{mode:"strip"}).replace(/^import .*;\r?\n/gm,"").replace(/\bexport (?=(?:async function|function|const))/g,"");}
function load(file,names,deps={}){return new Function(...Object.keys(deps),executable(file)+"\nreturn {"+names.join(",")+"};")(...Object.values(deps));}
const schemas=load("lib/erp-batches.ts",["batchCreate","batchPatch","batchCommandSchema"],{z});
const readiness=load("lib/academic-offering-readiness.ts",["batchOfferingReadySql"]);
const commands=load("modules/academics/batches/commands.ts",["runBatchCommand"],{...schemas,...readiness});
const http=load("modules/academics/batches/http.ts",["parseBatchBody","batchRequestIdentity"],{z});
const actor=()=>authenticated?{profileId,permissions}:null;
const deps={env,...schemas,...readiness,...commands,...http,z,
 getCommandAccess:async()=>actor(),getErpContext:async()=>actor(),
 headers:async()=>new Headers({origin,host:"academy.invalid"}),revalidatePath:()=>{},
 privateJson:(body,status=200)=>Response.json(body,{status}),
 sameOrigin:r=>r.headers.get("origin")===new URL(r.url).origin,
};
const admissionSchemas=load("modules/admissions/schema.ts",["commandSchema"],{z});
const actions=load("modules/academics/batches/actions.ts",["runAcademicBatchCommand","changeRecordState"],{...deps,...admissionSchemas});
const route=load("app/api/staff/batches/route.ts",["GET","POST"],deps);
const detail=load("app/api/staff/batches/[id]/route.ts",["PATCH"],deps);
const create=(overrides={})=>({requestId:uuid(),code:"PARITY-A",name:"Verified cohort",offeringId:"sa-ssc-science",capacity:12,reason:"Verified operator batch command",...overrides});
const canonical=(overrides={})=>({action:"CREATE_BATCH",...create(overrides)});
const patch=(overrides={})=>({requestId:uuid(),name:"Updated cohort",capacity:12,nextStatus:"ACTIVE",expectedVersion:1,reason:"Verified operator batch edit",...overrides});
const request=(body,options={})=>new Request("https://academy.invalid/api/staff/batches",{method:options.method??"POST",headers:{origin,"content-type":"application/json",...options.headers},body:JSON.stringify(body)});
const post=body=>route.POST(request(body));
const update=(id,body)=>detail.PATCH(request(body,{method:"PATCH"}),{params:Promise.resolve({id})});
const count=table=>db.prepare("SELECT COUNT(*) AS n FROM "+table).get().n;
const row=id=>db.prepare("SELECT * FROM academy_batches WHERE id=?").get(id);
async function makeRest(overrides={}){const response=await post(create(overrides));assert.equal(response.status,201,JSON.stringify(await response.clone().json()));return (await response.json()).id;}
function enrollment(batchId,n){const sid=uuid(),aid=uuid();
 db.prepare("INSERT INTO academy_students(id,student_no,full_name,guardian_name,guardian_mobile,status) VALUES (?,?,?,?,?,'ACTIVE')").run(sid,"PARITY-"+n,"Synthetic student "+n,"Synthetic guardian","01700000001");
 db.prepare("INSERT INTO academy_admissions(id,application_no,offering_id,student_id,status,prepared_by,batch_id) VALUES (?,?,?,?,'ENROLLED',?,?)").run(aid,"PARITY-APP-"+n,"sa-ssc-science",sid,uid,batchId);
 db.prepare("INSERT INTO academy_enrollments(id,student_id,batch_id,admission_id,status) VALUES (?,?,?,?,'ACTIVE')").run(uuid(),sid,batchId,aid);
}
beforeEach(()=>{
 db?.close();db=new DatabaseSync(":memory:");db.exec("PRAGMA foreign_keys=ON");
 for(const file of fs.readdirSync("migrations").filter(n=>/^\d{4}_.*\.sql$/.test(n)&&Number(n.slice(0,4))<=28).sort())db.exec(fs.readFileSync(path.join("migrations",file),"utf8"));
 db.exec(fs.readFileSync("migrations/0030_academic_source_workflows.sql","utf8"));
 for(const id of [uid,other])db.prepare('INSERT INTO "user"(id,name,email,"createdAt","updatedAt") VALUES (?,?,?,?,?)').run(id,"Synthetic operator",id+"@example.invalid",0,0);
 db.prepare("INSERT INTO academy_branches(id,code,name) VALUES (?,'PARITY','Verified Campus')").run(branch);
 db.prepare("INSERT INTO academy_programmes(id,code,name) VALUES (?,'PARITY','Verified Programme')").run(programme);
 db.prepare("INSERT INTO academic_years(id,code,title,status) VALUES (?,'2026','Verified year','ACTIVE')").run(year);
 db.prepare("INSERT INTO academy_classes(id,code,name) VALUES (?,'PARITY','Class 10')").run(grade);
 db.prepare("UPDATE public_programme_offerings SET branch_id=?,academic_year_id=?,class_id=?,program_id=?,operation_kind='COACHING',offering_status='ACTIVE',is_active=1 WHERE id='sa-ssc-science'").run(branch,year,grade,programme);
 db.prepare("INSERT INTO academy_fee_plans(id,offering_id,title,monthly_amount_paisa,admission_amount_paisa,active) VALUES (?,'sa-ssc-science','Verified current fee',250000,100000,1)").run(uuid());
 permissions=["academics.view","academics.manage"];profileId=uid;authenticated=true;origin="https://academy.invalid";sqlRead=[];beforeBatch=null;afterReplayRead=null;
});
after(()=>db?.close());

test("REST and Server Action deny absent named grants and bad origin before reading SQL",async()=>{
 permissions=[];assert.equal((await post(create())).status,403);assert.equal((await actions.runAcademicBatchCommand(canonical())).ok,false);
 assert.equal((await route.GET(new Request("https://academy.invalid/api/staff/batches"))).status,403);assert.equal(sqlRead.length,0);
 permissions=["academics.manage"];origin="https://other.invalid";
 assert.equal((await post(create())).status,403);assert.equal((await actions.runAcademicBatchCommand(canonical())).ok,false);assert.equal(sqlRead.length,0);
 authenticated=false;assert.equal((await post(create())).status,401);assert.equal(sqlRead.length,0);
});
test("delegated named grants authorize reads and mutations without a coarse role",async()=>{
 const response=await route.GET(new Request("https://academy.invalid/api/staff/batches"));assert.equal(response.status,200);assert.equal((await response.json()).canEdit,true);
 permissions=["academics.view"];const readonly=await route.GET(new Request("https://academy.invalid/api/staff/batches"));assert.equal((await readonly.json()).canEdit,false);
 permissions=["academics.manage"];await makeRest();assert.equal((await actions.runAcademicBatchCommand(canonical({code:"PARITY-B"}))).ok,true);
});
test("bounded adapters require explicit retry identity and reject invalid capacity",async()=>{
 const body=create();delete body.requestId;assert.equal((await post(body)).status,400);
 assert.equal((await route.POST(request(body,{headers:{"Idempotency-Key":uuid()}}))).status,201);
 assert.equal((await post(create({code:"PARITY-B",capacity:13}))).status,400);
 assert.equal((await actions.runAcademicBatchCommand(canonical({capacity:13}))).ok,false);
 assert.equal((await route.POST(request(create({code:"PARITY-C"}),{headers:{"Idempotency-Key":uuid()}}))).status,400);
 assert.equal((await route.POST(request({reason:"x".repeat(4000)}))).status,413);assert.equal(count("academy_batches"),1);
});
test("both adapters bind the real offering year and retain their create response lifecycle",async()=>{
 const id=await makeRest();assert.equal(row(id).status,"PLANNED");assert.equal(row(id).year_id,year);
 const result=await actions.runAcademicBatchCommand(canonical({code:"PARITY-B"}));assert.equal(result.ok,true);assert.equal(row(result.entityId).status,"ACTIVE");assert.equal(row(result.entityId).year_id,year);
 assert.equal((await post(create({code:"PARITY-C",yearId:other}))).status,409);assert.equal(count("academy_batches"),2);
});
for(const [label,sql] of [
 ["draft offering","UPDATE public_programme_offerings SET offering_status='DRAFT' WHERE id='sa-ssc-science'"],
 ["inactive campus","UPDATE academy_branches SET is_active=0"],
 ["inactive programme","UPDATE academy_programmes SET active=0"],
 ["inactive class","UPDATE academy_classes SET is_active=0"],
 ["closed academic year","UPDATE academic_years SET status='CLOSED'"],
 ["missing current fee","UPDATE academy_fee_plans SET active=0"],
])test("REST and Server Action reject "+label+" with no batch/key/audit",async()=>{
 db.exec(sql);assert.equal((await post(create())).status,409);assert.equal((await actions.runAcademicBatchCommand(canonical({code:"PARITY-B"}))).ok,false);
 assert.equal(count("academy_batches"),0);assert.equal(count("academy_offering_command_keys"),0);assert.equal(count("erp_audit_events"),0);
 const response=await route.GET(new Request("https://academy.invalid/api/staff/batches"));assert.equal((await response.json()).offerings.some(o=>o.id==="sa-ssc-science"),false);
});
for(const [label,from,to] of [["future","+1 day","+1 year"],["expired","-2 days","-1 day"]])test("both adapters reject a "+label+" published fee version",async()=>{
 const fee=db.prepare("SELECT id FROM academy_fee_plans").get().id;
 db.prepare("UPDATE academy_fee_plans SET source_version=1,source_status='DRAFT',active=0,effective_from=date('now','+6 hours',?),effective_to=date('now','+6 hours',?) WHERE id=?").run(from,to,fee);
 db.prepare("INSERT INTO academy_fee_plan_components(id,plan_id,code,name,amount_paisa,charge_type,recurrence,sort_order) VALUES (?,?,'TUITION','Tuition',250000,'TUITION','PER_CYCLE',0)").run(uuid(),fee);
 db.prepare("INSERT INTO academy_fee_plan_components(id,plan_id,code,name,amount_paisa,charge_type,recurrence,sort_order) VALUES (?,?,'ADMISSION','Admission',100000,'ADMISSION','ONE_TIME',1)").run(uuid(),fee);
 db.prepare("UPDATE academy_fee_plans SET active=1,source_status='ACTIVE' WHERE id=?").run(fee);
 assert.equal((await post(create())).status,409);assert.equal((await actions.runAcademicBatchCommand(canonical({code:"PARITY-B"}))).ok,false);
 assert.equal(count("academy_batches"),0);assert.equal(count("academy_offering_command_keys"),0);assert.equal(count("erp_audit_events"),0);
});
test("readiness is rechecked in SQL when the fee changes after preflight",async()=>{
 beforeBatch=()=>db.exec("UPDATE academy_fee_plans SET active=0");assert.equal((await post(create())).status,409);
 assert.equal(count("academy_batches"),0);assert.equal(count("academy_offering_command_keys"),0);assert.equal(count("erp_audit_events"),0);
});
test("parallel REST retries recover one batch, command key and audit",async()=>{
 const body=create(),results=await Promise.all([post(body),post(body)]);assert.deepEqual(results.map(r=>r.status),[201,201]);
 const [a,b]=await Promise.all(results.map(r=>r.json()));assert.equal(a.id,b.id);assert.equal(count("academy_batches"),1);assert.equal(count("academy_offering_command_keys"),1);assert.equal(count("erp_audit_events"),1);
 assert.equal((await post({...body,name:"Different input"})).status,409);profileId=other;assert.equal((await post(body)).status,409);assert.equal(count("academy_batches"),1);
});
test("REST and Server Action guard stale edits and concurrent active occupancy",async()=>{
 const id=await makeRest();beforeBatch=()=>{enrollment(id,1);enrollment(id,2);};assert.equal((await update(id,patch({capacity:1}))).status,409);assert.equal(row(id).capacity,12);
 const input=canonical({action:"EDIT_BATCH",batchId:id,expectedVersion:1,capacity:1});assert.equal((await actions.runAcademicBatchCommand(input)).ok,false);
 const body=patch();assert.equal((await update(id,body)).status,200);assert.equal((await update(id,body)).status,200);assert.equal(row(id).version,2);
 assert.equal((await actions.runAcademicBatchCommand(canonical({action:"EDIT_BATCH",batchId:id,expectedVersion:1}))).ok,false);assert.equal(count("erp_audit_events"),2);
});
test("exact edit retry recovers when another request commits after its replay lookup",async()=>{
 const id=await makeRest(),body=patch();
 afterReplayRead=async()=>{assert.equal((await update(id,body)).status,200);};
 assert.equal((await update(id,body)).status,200);assert.equal(row(id).version,2);
 assert.equal(count("academy_offering_command_keys"),2);assert.equal(count("erp_audit_events"),2);
});
test("active edits and lifecycle cannot bypass fee readiness or displayed version",async()=>{
 const result=await actions.runAcademicBatchCommand(canonical()),id=result.entityId;assert.equal(result.ok,true);
 db.exec("UPDATE academy_fee_plans SET active=0");assert.equal((await update(id,patch())).status,409);
 assert.equal((await actions.runAcademicBatchCommand(canonical({action:"EDIT_BATCH",batchId:id,expectedVersion:1}))).ok,false);
 const state={entity:"batch",id,active:false,requestId:uuid(),expectedVersion:1,reason:"Pause current cohort intake"};
 assert.equal((await actions.changeRecordState(state)).ok,true);assert.equal((await actions.changeRecordState(state)).ok,true);assert.equal(row(id).version,2);
 assert.equal((await actions.changeRecordState({...state,requestId:uuid(),active:true,expectedVersion:1})).ok,false);
 assert.equal((await actions.changeRecordState({...state,requestId:uuid(),active:true,expectedVersion:2})).ok,false);assert.equal(row(id).status,"PLANNED");
});
test("REST closure preserves enrollment history and neither adapter reopens terminal batches",async()=>{
 const id=await makeRest();assert.equal((await update(id,patch())).status,200);enrollment(id,1);
 assert.equal((await update(id,patch({nextStatus:"COMPLETED",expectedVersion:2}))).status,200);
 assert.equal((await update(id,patch({expectedVersion:3}))).status,409);
 assert.equal((await actions.changeRecordState({entity:"batch",id,active:true,requestId:uuid(),expectedVersion:3,reason:"Never reopen historical closure"})).ok,false);
 assert.equal(row(id).status,"COMPLETED");assert.equal(count("academy_enrollments"),1);assert.equal(count("erp_audit_events"),3);
});
test("concurrent revision and failed audit leave no ghost keys or partial writes",async()=>{
 const id=await makeRest();beforeBatch=()=>db.prepare("UPDATE academy_batches SET version=version+1 WHERE id=?").run(id);
 assert.equal((await update(id,patch())).status,409);assert.equal(count("academy_offering_command_keys"),1);assert.equal(count("erp_audit_events"),1);
 db.exec("CREATE TRIGGER parity_fail_audit BEFORE INSERT ON erp_audit_events WHEN NEW.entity_type='academy_batch' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END");
 assert.equal((await post(create({code:"PARITY-B"}))).status,409);assert.equal(count("academy_batches"),1);assert.equal(count("academy_offering_command_keys"),1);
});
test("failed edit audit rolls back metadata, lifecycle, version and request identity for both adapters",async()=>{
 const id=await makeRest();db.exec("CREATE TRIGGER parity_fail_edit_audit BEFORE INSERT ON erp_audit_events WHEN NEW.entity_type='academy_batch' BEGIN SELECT RAISE(ABORT,'synthetic edit audit failure'); END");
 assert.equal((await update(id,patch({name:"Must roll back"}))).status,409);
 assert.equal((await actions.runAcademicBatchCommand(canonical({action:"EDIT_BATCH",batchId:id,expectedVersion:1,name:"Must also roll back"}))).ok,false);
 assert.equal(row(id).name,"Verified cohort");assert.equal(row(id).status,"PLANNED");assert.equal(row(id).version,1);
 assert.equal(count("academy_offering_command_keys"),1);assert.equal(count("erp_audit_events"),1);
});
