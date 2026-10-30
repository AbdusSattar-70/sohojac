import {batchOfferingReadySql} from "../lib/academic-offering-readiness.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {stripTypeScriptTypes} from "node:module";
import {DatabaseSync} from "node:sqlite";
import {beforeEach,after,test} from "node:test";
import {z} from "zod";

const uid="11111111-1111-4111-8111-111111111111",branch="22222222-2222-4222-8222-222222222222",year="33333333-3333-4333-8333-333333333333",grade="44444444-4444-4444-8444-444444444444",programme="55555555-5555-4555-8555-555555555555";
const uuid=()=>crypto.randomUUID();
let db,permissions,sqlRead,beforeBatch,origin;
const env={DB:{prepare(sql){sqlRead.push(sql);return {bind(...values){return {sql,values,async first(){return db.prepare(sql).get(...values)??null;},async all(){return {results:db.prepare(sql).all(...values)};}};},sql,values:[],async all(){return {results:db.prepare(sql).all()};}};},async batch(statements){
 if(beforeBatch){const f=beforeBatch;beforeBatch=null;await f();}
 db.exec("BEGIN");try{const results=statements.map(s=>{const statement=db.prepare(s.sql);const rows=/\bRETURNING\b/i.test(s.sql)?statement.all(...s.values):(statement.run(...s.values),[]);return {results:rows,meta:{changes:db.prepare("SELECT changes() AS n").get().n}};});db.exec("COMMIT");return results;}catch(error){db.exec("ROLLBACK");throw error;}
}}};
const headers=async()=>new Headers({origin,host:"academy.invalid"});
const getErpContext=async()=>({profileId:uid,permissions});
async function requirePermission(p){if(!permissions.includes(p))throw Error("Permission denied");return {profileId:uid,permissions};}
function executable(file){return stripTypeScriptTypes(fs.readFileSync(new URL("../"+file,import.meta.url),"utf8"),{mode:"strip"}).replace(/^import .*;\r?\n/gm,"").replace(/\bexport (?=(?:async function|function|const))/g,"");}
const schemas=new Function("z",executable("modules/admissions/schema.ts")+"\nreturn {commandSchema,workspaceSchema};")(z);
let batchSchemas={},batchCommands={};
function load(file,exports){const deps={batchOfferingReadySql,env,headers,getErpContext,requirePermission,revalidatePath:()=>{},z,...schemas,...batchSchemas,...batchCommands};return new Function(...Object.keys(deps),executable(file)+"\nreturn {"+exports.join(",")+"};")(...Object.values(deps));}
batchSchemas=load("lib/erp-batches.ts",["batchCommandSchema"]);
batchCommands=load("modules/academics/batches/commands.ts",["runBatchCommand"]);
const actions=load("modules/academics/batches/actions.ts",["runAcademicBatchCommand","changeRecordState"]);
const reads=load("modules/academics/batches/queries.ts",["getBatchWorkspace"]);
const publicReads=load("modules/offerings/queries.ts",["getPublicProgrammeOfferings"]);
function command(overrides={}){return {action:"CREATE_BATCH",requestId:uuid(),offeringId:"sa-ssc-science",code:"SOURCE-A",name:"Source Science A",capacity:12,reason:"Verified programme cohort placement",...overrides};}
function count(table){return db.prepare("SELECT COUNT(*) AS n FROM "+table).get().n;}
function enrollment(batchId,n){
 const sid=uuid(),aid=uuid();
 db.prepare("INSERT INTO academy_students(id,student_no,full_name,guardian_name,guardian_mobile,status) VALUES (?,?,?,?,?,'ACTIVE')").run(sid,"SA-LOCAL-"+n,"Synthetic student "+n,"Synthetic guardian","01700000001");
 db.prepare("INSERT INTO academy_admissions(id,application_no,offering_id,student_id,status,prepared_by,batch_id) VALUES (?,?,?,?,'ENROLLED',?,?)").run(aid,"APP-LOCAL-"+n,"sa-ssc-science",sid,uid,batchId);
 db.prepare("INSERT INTO academy_enrollments(id,student_id,batch_id,admission_id,status) VALUES (?,?,?,?,'ACTIVE')").run(uuid(),sid,batchId,aid);
}
beforeEach(()=>{
 db?.close();db=new DatabaseSync(":memory:");db.exec("PRAGMA foreign_keys=ON");
 const base=fs.existsSync("migrations/history/0001_public_website.sql")?"migrations/history/history":"scratch/ci-migrations";
 for(const file of fs.readdirSync(base).filter(n=>/^\d{4}_.*\.sql$/.test(n)&&Number(n.slice(0,4))<=28).sort())db.exec(fs.readFileSync(path.join(base,file),"utf8"));
 db.exec(fs.readFileSync("migrations/history/0030_academic_source_workflows.sql","utf8"));
 db.prepare('INSERT INTO "user"(id,name,email,"createdAt","updatedAt") VALUES (?,?,?,?,?)').run(uid,"Synthetic Owner","batch-owner@example.invalid",0,0);
 db.prepare("INSERT INTO academy_branches(id,code,name) VALUES (?,'MAIN','Verified Campus')").run(branch);
 db.prepare("INSERT INTO academy_programmes(id,code,name) VALUES (?,'SCIENCE','Science Preparation')").run(programme);
 db.prepare("INSERT INTO academic_years(id,code,title,status) VALUES (?,'2026','Academic Year 2026','ACTIVE')").run(year);
 db.prepare("INSERT INTO academy_classes(id,code,name) VALUES (?,'CLASS10','Class 10')").run(grade);
 db.prepare("UPDATE public_programme_offerings SET branch_id=?,academic_year_id=?,class_id=?,program_id=?,operation_kind='COACHING',offering_status='ACTIVE',is_active=1 WHERE id='sa-ssc-science'").run(branch,year,grade,programme);
 db.prepare("INSERT INTO academy_fee_plans(id,offering_id,title,monthly_amount_paisa,admission_amount_paisa,active) VALUES (?,'sa-ssc-science','Historical verified standard',250000,100000,1)").run(uuid());
 permissions=["academics.view","academics.manage"];sqlRead=[];beforeBatch=null;origin="https://academy.invalid";
});
after(()=>db?.close());

test("batch commands require named academic management permission and same origin before SQL",async()=>{
 permissions=[];assert.equal((await actions.runAcademicBatchCommand(command())).ok,false);assert.equal(sqlRead.length,0);
 await assert.rejects(reads.getBatchWorkspace(),/Permission denied/);
 permissions=["academics.manage"];origin="https://other.invalid";sqlRead=[];assert.equal((await actions.runAcademicBatchCommand(command())).ok,false);assert.equal(sqlRead.length,0);
});
test("source creation preserves verified offering/year and request retries do not duplicate batches",async()=>{
 const input=command(),result=await actions.runAcademicBatchCommand(input);assert.equal(result.ok,true);
 const row=db.prepare("SELECT * FROM academy_batches WHERE id=?").get(result.entityId);assert.equal(row.offering_id,"sa-ssc-science");assert.equal(row.year_id,year);assert.equal(row.status,"ACTIVE");assert.equal(row.capacity,12);
 const audit=count("erp_audit_events");assert.equal((await actions.runAcademicBatchCommand(input)).entityId,result.entityId);assert.equal(count("academy_batches"),1);assert.equal(count("erp_audit_events"),audit);
 assert.equal((await actions.runAcademicBatchCommand({...input,name:"Different request"})).ok,false);
});
test("new batches require verified linked context and a current fee plan, with no fake fallback",async()=>{
 db.exec("UPDATE public_programme_offerings SET branch_id=NULL WHERE id='sa-ssc-science'");
 assert.equal((await actions.runAcademicBatchCommand(command())).ok,false);assert.equal(count("academy_batches"),0);
 db.prepare("UPDATE public_programme_offerings SET branch_id=? WHERE id='sa-ssc-science'").run(branch);db.exec("UPDATE academy_fee_plans SET active=0");
 assert.equal((await actions.runAcademicBatchCommand(command())).ok,false);assert.equal(count("academy_offering_command_keys"),0);
});
test("capacity rejects policy violations and concurrent shrink below genuine enrollment",async()=>{
 assert.equal((await actions.runAcademicBatchCommand(command({capacity:13}))).ok,false);
 const made=await actions.runAcademicBatchCommand(command());
 beforeBatch=()=>{enrollment(made.entityId,1);enrollment(made.entityId,2);};
 const result=await actions.runAcademicBatchCommand(command({action:"EDIT_BATCH",batchId:made.entityId,expectedVersion:1,capacity:1}));
 assert.equal(result.ok,false);assert.equal(db.prepare("SELECT capacity FROM academy_batches WHERE id=?").get(made.entityId).capacity,12);
 assert.equal(count("academy_enrollments"),2);assert.equal(count("erp_audit_events"),1);
});
test("editing changes only cohort metadata, guards stale revisions, and keeps offering history",async()=>{
 const made=await actions.runAcademicBatchCommand(command());
 const input=command({action:"EDIT_BATCH",batchId:made.entityId,expectedVersion:1,code:"SOURCE-B",name:"Renamed cohort",offeringId:"sa-annual-2026",capacity:10});
 assert.equal((await actions.runAcademicBatchCommand(input)).ok,true);
 const row=db.prepare("SELECT * FROM academy_batches WHERE id=?").get(made.entityId);assert.equal(row.version,2);assert.equal(row.offering_id,"sa-ssc-science");assert.equal(row.year_id,year);assert.equal(row.code,"SOURCE-B");
 assert.equal((await actions.runAcademicBatchCommand({...input,requestId:uuid(),name:"Stale overwrite"})).ok,false);
 assert.equal((await actions.runAcademicBatchCommand(input)).ok,true);
});
test("source lifecycle stops new use without deleting active enrollment and never reopens final historical states",async()=>{
 const made=await actions.runAcademicBatchCommand(command());enrollment(made.entityId,1);
 assert.equal((await actions.changeRecordState({entity:"batch",id:made.entityId,requestId:uuid(),expectedVersion:1,active:false,reason:"Pause new cohort intake"})).ok,true);
 assert.equal(db.prepare("SELECT status FROM academy_batches WHERE id=?").get(made.entityId).status,"PLANNED");assert.equal(count("academy_enrollments"),1);
 assert.equal((await actions.changeRecordState({entity:"batch",id:made.entityId,requestId:uuid(),expectedVersion:2,active:true,reason:"Reopen verified cohort"})).ok,true);
 db.prepare("UPDATE academy_batches SET status='COMPLETED' WHERE id=?").run(made.entityId);
 assert.equal((await actions.changeRecordState({entity:"batch",id:made.entityId,requestId:uuid(),expectedVersion:3,active:true,reason:"Do not reopen historical closure"})).ok,false);
});
test("academic batch workspace contains real cohort occupancy but never queries applicant identity, invoices or payments",async()=>{
 const made=await actions.runAcademicBatchCommand(command());enrollment(made.entityId,1);sqlRead=[];
 const data=await reads.getBatchWorkspace();assert.equal(data.capacityLimit,12);assert.equal(data.batches[0].occupied,1);assert.equal(data.batches[0].version,1);assert.equal(data.batches[0].yearName,"Academic Year 2026");
 assert.deepEqual(data.cases,[]);assert.deepEqual(data.prospects,[]);assert.deepEqual(data.paymentMethods,[]);
 assert(!sqlRead.some(q=>/FROM academy_students|FROM academy_admissions|FROM public_enquiries|FROM finance_invoices|FROM finance_payments/.test(q)));
 assert(!sqlRead.some(q=>/monthly_amount_paisa|admission_amount_paisa/.test(q)));
});
test("concurrent revision changes reject edits without ghost request keys or audit events",async()=>{
 const made=await actions.runAcademicBatchCommand(command());const n=count("erp_audit_events");
 beforeBatch=()=>db.prepare("UPDATE academy_batches SET version=version+1 WHERE id=?").run(made.entityId);
 const result=await actions.runAcademicBatchCommand(command({action:"EDIT_BATCH",batchId:made.entityId,expectedVersion:1,name:"Stale saved name"}));assert.equal(result.ok,false);assert.equal(count("erp_audit_events"),n);assert.equal(count("academy_offering_command_keys"),1);
});
test("an audit constraint failure rolls back the complete new batch and request identity",async()=>{
 db.exec("CREATE TRIGGER fail_batch_audit BEFORE INSERT ON erp_audit_events WHEN NEW.entity_type='academy_batch' BEGIN SELECT RAISE(ABORT,'synthetic audit constraint'); END");
 assert.equal((await actions.runAcademicBatchCommand(command())).ok,false);assert.equal(count("academy_batches"),0);assert.equal(count("academy_offering_command_keys"),0);
});

test("public seats reflect actual active cohorts and enrollments rather than cached counters",async()=>{
 const made=await actions.runAcademicBatchCommand(command());enrollment(made.entityId,1);enrollment(made.entityId,2);
 db.exec("UPDATE public_programme_offerings SET active_batch_count=0,current_total_seats=0,current_open_seats=0 WHERE id='sa-ssc-science'");
 let catalogue=await publicReads.getPublicProgrammeOfferings();let offering=catalogue.find(o=>o.id==="sa-ssc-science");
 assert.equal(offering.active_batch_count,1);assert.equal(offering.current_total_seats,12);assert.equal(offering.current_open_seats,10);
 await actions.changeRecordState({entity:"batch",id:made.entityId,requestId:uuid(),expectedVersion:1,active:false,reason:"Pause cohort intake"});
 catalogue=await publicReads.getPublicProgrammeOfferings();offering=catalogue.find(o=>o.id==="sa-ssc-science");
 assert.equal(offering.active_batch_count,0);assert.equal(offering.current_total_seats,0);assert.equal(offering.current_open_seats,0);
});

test("inactive class context are unavailable in both choices and batch commands",async()=>{
 db.exec("UPDATE academy_classes SET is_active=0");
 const result=await actions.runAcademicBatchCommand(command());assert.equal(result.ok,false);assert.equal(result.field,'offeringId');
 assert.equal((await reads.getBatchWorkspace()).offerings.find(o=>o.id==='sa-ssc-science').feeReady,false);
});

test("expired published fees block new batches and reactivation consistently",async()=>{
 const made=await actions.runAcademicBatchCommand(command());assert.equal(made.ok,true);
 const plan=uuid();db.exec("UPDATE academy_fee_plans SET active=0");
 db.prepare("INSERT INTO academy_fee_plans(id,offering_id,title,monthly_amount_paisa,admission_amount_paisa,active,source_version,source_status,billing_cycle,due_day,currency_code,effective_from,effective_to) VALUES (?,'sa-ssc-science','Past term',250000,0,0,1,'DRAFT','MONTHLY',10,'BDT','2020-01-01','2020-12-31')").run(plan);
 db.prepare("INSERT INTO academy_fee_plan_components(id,plan_id,code,name,amount_paisa,charge_type,recurrence,sort_order) VALUES (?,?,'TUITION','Tuition',250000,'TUITION','PER_CYCLE',0)").run(uuid(),plan);
 db.prepare("UPDATE academy_fee_plans SET source_status='ACTIVE',active=1 WHERE id=?").run(plan);
 assert.equal((await actions.runAcademicBatchCommand(command({code:'EXPIRED-A'}))).ok,false);
 assert.equal((await reads.getBatchWorkspace()).offerings.find(o=>o.id==='sa-ssc-science').feeReady,false);
 assert.equal((await actions.changeRecordState({entity:'batch',id:made.entityId,requestId:uuid(),expectedVersion:1,active:false,reason:'Pause expired term intake'})).ok,true);
 assert.equal((await actions.changeRecordState({entity:'batch',id:made.entityId,requestId:uuid(),expectedVersion:2,active:true,reason:'Reject expired term reopen'})).ok,false);
});

