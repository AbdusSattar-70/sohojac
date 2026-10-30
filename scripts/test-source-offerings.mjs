import {defaultDueDay} from "../lib/fee-plan-defaults.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {stripTypeScriptTypes} from "node:module";
import {DatabaseSync} from "node:sqlite";
import {beforeEach,after,test} from "node:test";

const ids={user:"11111111-1111-4111-8111-111111111111",branch:"22222222-2222-4222-8222-222222222222",program:"33333333-3333-4333-8333-333333333333",year:"44444444-4444-4444-8444-444444444444",class:"55555555-5555-4555-8555-555555555555",otherClass:"66666666-6666-4666-8666-666666666666"};
let db,permissions,queries,beforeBatch;
const env={DB:{prepare(sql){
 queries.push(sql);
 return {bind(...values){return {async first(){return db.prepare(sql).get(...values)??null;},async all(){return {results:db.prepare(sql).all(...values)};},sql,values};},async all(){return {results:db.prepare(sql).all()};},sql,values:[]};
},async batch(statements){
 if(beforeBatch){const change=beforeBatch;beforeBatch=null;await change();}
 db.exec("BEGIN");
 try{const results=statements.map(s=>{const statement=db.prepare(s.sql);const rows=/\bRETURNING\b/i.test(s.sql)?statement.all(...s.values):(statement.run(...s.values),[]);return {results:rows,meta:{changes:db.prepare("SELECT changes() AS n").get().n}};});db.exec("COMMIT");return results;}catch(e){db.exec("ROLLBACK");throw e;}
}}};
const headers=async()=>new Headers({origin:"https://academy.invalid",host:"academy.invalid"});
const getErpContext=async()=>({profileId:ids.user,permissions});
async function requirePermission(p){if(!permissions.includes(p))throw Error("Permission denied");return {profileId:ids.user,permissions};}
const pass={safeParse:value=>({success:true,data:value})};
const schemaNames=["createOfferingSchema","updateOfferingSchema","publishFeePlanSchema","updateOfferingPublicControlsSchema"];
let realZod;
let realSchemas=Object.fromEntries(schemaNames.map(name=>[name,pass]));
try{
 realZod=(await import("zod")).z;
 const schemaCode=stripTypeScriptTypes(fs.readFileSync(new URL("../modules/offerings/schema.ts",import.meta.url),"utf8"),{mode:"strip"}).replace(/^import .*;\r?\n/gm,"").replace(/\bexport (?=(?:const|function))/g,"");
 realSchemas=new Function("z",schemaCode+"\nreturn {"+schemaNames.join(",")+"};")(realZod);
}catch(error){
 if(error.code!=="ERR_MODULE_NOT_FOUND"||process.env.CI)throw error;
 console.log("Local SQL/permission checks only: Zod is unavailable. CI uses the installed real schemas.");
}
function load(file,exports,extra={}){
 const code=stripTypeScriptTypes(fs.readFileSync(new URL("../"+file,import.meta.url),"utf8"),{mode:"strip"}).replace(/^import .*;\r?\n/gm,"").replace(/\bexport (?=(?:async function|function|const))/g,"");
 const dependencies={env,headers,getErpContext,requirePermission,revalidatePath:()=>{},...realSchemas,...extra};
 return new Function(...Object.keys(dependencies),code+"\nreturn {"+exports.join(",")+"};")(...Object.values(dependencies));
}
const actions=load("modules/offerings/actions.ts",["createProgrammeOffering","updateProgrammeOffering","publishFeePlan","updateProgrammeOfferingPublicControls"]);
const reads=load("modules/offerings/queries.ts",["getOfferingOverview","getWebsiteOfferings"]);
const z=realZod??new Proxy(function(){},{get:(_,key)=>key==="object"?()=>pass:z,apply:()=>z});
const discount=load("modules/offerings/discount-actions.ts",["saveOfferingDiscountPolicy"],{z});
const state=load("modules/offerings/state-actions.ts",["changeRecordState"],{z});
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Dhaka",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const uuid=()=>crypto.randomUUID();
function create(overrides={}){return {branchId:ids.branch,programId:ids.program,academicYearId:ids.year,classId:ids.class,groupId:"",operationKind:"COACHING",teachingStartsOn:"",teachingEndsOn:"",code:"SCIENCE-A",name:"",reason:"Verified source learning context",requestId:uuid(),...overrides};}
function publicInput(id,overrides={}){return {offeringId:id,showcaseTitle:"Science course",showcaseTitleBn:"",showcaseDescription:"Verified science learning programme",showcaseDescriptionBn:"",showcaseEyebrow:"",showcaseEyebrowBn:"",publicSchedule:"",publicScheduleBn:"",publicRequirements:"",publicRequirementsBn:"",admissionPolicy:"",admissionPolicyBn:"",showcaseIcon:"",showcaseSortOrder:10,isWebsiteVisible:true,isAcceptingApplications:true,applicationsOpenOn:"",applicationsCloseOn:"",subjectIds:["physics"],reason:"Verified source public settings",requestId:uuid(),...overrides};}
function fee(id,overrides={}){return {offeringId:id,requestId:uuid(),expectedVersion:db.prepare("SELECT version FROM public_programme_offerings WHERE id=?").get(id).version,billingCycle:"MONTHLY",dueDay:10,effectiveFrom:today(),reason:"Approved source standard charges",components:[{code:"TUITION",name:"Tuition",amount:2500.01,chargeType:"TUITION",recurrence:"PER_CYCLE"},{code:"ADMISSION",name:"Admission",amount:100,chargeType:"ADMISSION",recurrence:"ONE_TIME"},{code:"EXAM",name:"Exam materials",amount:20.02,chargeType:"EXAM",recurrence:"ONE_TIME"}],...overrides};}
function count(table){return db.prepare("SELECT COUNT(*) AS n FROM "+table).get().n;}
beforeEach(()=>{
 db?.close();db=new DatabaseSync(":memory:");db.exec("PRAGMA foreign_keys=ON");
 const base=fs.existsSync("migrations/0001_public_website.sql")?"migrations":"scratch/ci-migrations";
 for(const file of fs.readdirSync(base).filter(n=>/^\d{4}_.*\.sql$/.test(n)&&Number(n.slice(0,4))<=28).sort())db.exec(fs.readFileSync(path.join(base,file),"utf8"));
 db.exec(fs.readFileSync("migrations/0030_academic_source_workflows.sql","utf8"));
 db.prepare('INSERT INTO "user"(id,name,email,"createdAt","updatedAt") VALUES (?,?,?,?,?)').run(ids.user,"Synthetic Owner","source-owner@example.invalid",0,0);
 db.prepare("INSERT INTO academy_branches(id,code,name) VALUES (?,?,?)").run(ids.branch,"MAIN","Verified Main Branch");
 db.prepare("INSERT INTO academy_programmes(id,code,name) VALUES (?,?,?)").run(ids.program,"SCIENCE","Science Preparation");
 db.prepare("INSERT INTO academic_years(id,code,title,status) VALUES (?,?,?,'ACTIVE')").run(ids.year,"2026","Academic Year 2026");
 db.prepare("INSERT INTO academy_classes(id,code,name) VALUES (?,?,?),(?,?,?)").run(ids.class,"CLASS10","Class 10",ids.otherClass,"CLASS9","Class 9");
 permissions=["academics.manage","academics.view","finance.view","finance.billing.manage"];queries=[];beforeBatch=null;
});
after(()=>db?.close());

test("named permissions reject offering and fee mutations before domain SQL",async()=>{
 permissions=[];
 assert.equal((await actions.createProgrammeOffering(create())).ok,false);
 assert.equal((await actions.publishFeePlan({})).ok,false);
 assert.equal(queries.length,0);
 await assert.rejects(reads.getOfferingOverview(),/Permission denied/);
});
test("offering creation uses verified masters, defaults only the programme title, and recovers exact retries",async()=>{
 const input=create();const a=await actions.createProgrammeOffering(input);assert.equal(a.ok,true);
 const row=db.prepare("SELECT * FROM public_programme_offerings WHERE id=?").get(a.reference);
 assert.equal(row.name,"Science Preparation");assert.equal(row.offering_status,"DRAFT");assert.equal(row.is_active,0);assert.equal(row.show_on_website,0);
 const n=count("erp_audit_events");assert.deepEqual(await actions.createProgrammeOffering(input),a);assert.equal(count("erp_audit_events"),n);
 assert.equal((await actions.createProgrammeOffering({...input,name:"Different request payload"})).ok,false);
 assert.equal(count("academy_offering_command_keys"),1);
});
test("unverified context and invalid training dates produce no offering/key/audit",async()=>{
 const n=count("public_programme_offerings");
 assert.equal((await actions.createProgrammeOffering(create({branchId:uuid()}))).ok,false);
 assert.equal((await actions.createProgrammeOffering(create({operationKind:"TRAINING",academicYearId:"",classId:""}))).ok,false);
 assert.equal(count("public_programme_offerings"),n);assert.equal(count("academy_offering_command_keys"),0);assert.equal(count("erp_audit_events"),0);
 const good=await actions.createProgrammeOffering(create({operationKind:"TRAINING",academicYearId:"",classId:"",teachingStartsOn:"2026-11-01",teachingEndsOn:"2026-12-01"}));
 assert.equal(good.ok,true);
});
test("legacy stable offering keys remain unlinked until a verified explicit edit",async()=>{
 const catalogue=await reads.getOfferingOverview();const legacy=catalogue.offerings.find(o=>o.id==="sa-ssc-science");
 assert.equal(legacy.branch_id,null);assert.equal(legacy.program_id,null);
 const edit=create({offeringId:legacy.id,expectedVersion:legacy.version,code:legacy.code,name:legacy.name});
 const result=await actions.updateProgrammeOffering(edit);assert.equal(result.ok,true);assert.equal(result.reference,"sa-ssc-science");
 assert.equal(db.prepare("SELECT branch_id FROM public_programme_offerings WHERE id='sa-ssc-science'").get().branch_id,ids.branch);
 assert.equal((await actions.updateProgrammeOffering({...edit,requestId:uuid(),name:"Stale title"})).ok,false);
});
test("a concurrently inserted batch prevents changing linked draft context",async()=>{
 const created=await actions.createProgrammeOffering(create());
 beforeBatch=()=>db.prepare("INSERT INTO academy_batches(id,code,name,offering_id,capacity,status) VALUES (?,'CONCURRENT','Concurrent cohort',?,12,'ACTIVE')").run(uuid(),created.reference);
 const change=await actions.updateProgrammeOffering(create({offeringId:created.reference,expectedVersion:1,classId:ids.otherClass,requestId:uuid()}));
 assert.equal(change.ok,false);
 assert.equal(db.prepare("SELECT class_id FROM public_programme_offerings WHERE id=?").get(created.reference).class_id,ids.class);
 assert.equal(count("academy_offering_command_keys"),1);
});
test("source fee publication preserves integer totals, components, public projection and immutable versions",async()=>{
 const offering=await actions.createProgrammeOffering(create());
 const firstInput=fee(offering.reference);const first=await actions.publishFeePlan(firstInput);assert.equal(first.ok,true);
 let plan=db.prepare("SELECT * FROM academy_fee_plans WHERE id=?").get(first.reference);
 assert.equal(plan.monthly_amount_paisa,250001);assert.equal(plan.admission_amount_paisa,12002);assert.equal(plan.source_version,1);assert.equal(plan.source_status,"ACTIVE");
 assert.equal(count("academy_fee_plan_components"),3);
 const publicPlan=JSON.parse(db.prepare("SELECT fee_plan_json FROM public_programme_offerings WHERE id=?").get(offering.reference).fee_plan_json);
 assert.equal(publicPlan.components[2].amount,20.02);
 const keys=count("academy_offering_command_keys");assert.deepEqual(await actions.publishFeePlan(firstInput),first);assert.equal(count("academy_offering_command_keys"),keys);
 const second=await actions.publishFeePlan(fee(offering.reference,{components:[{code:"TUITION",name:"New tuition",amount:3000,chargeType:"TUITION",recurrence:"PER_CYCLE"}]}));assert.equal(second.ok,true);
 plan=db.prepare("SELECT * FROM academy_fee_plans WHERE id=?").get(first.reference);
 assert.equal(plan.source_status,"RETIRED");assert.equal(plan.monthly_amount_paisa,250001);assert.equal(plan.effective_to,today());
 assert.equal(db.prepare("SELECT source_version FROM academy_fee_plans WHERE id=?").get(second.reference).source_version,2);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM academy_fee_plans WHERE offering_id=? AND active=1").get(offering.reference).n,1);
});
test("concurrent offering changes reject stale fee publication with no partial plan/key/components",async()=>{
 const offering=await actions.createProgrammeOffering(create());const input=fee(offering.reference);
 beforeBatch=()=>db.prepare("UPDATE public_programme_offerings SET version=version+1 WHERE id=?").run(offering.reference);
 assert.equal((await actions.publishFeePlan(input)).ok,false);assert.equal(count("academy_fee_plans"),0);assert.equal(count("academy_fee_plan_components"),0);assert.equal(count("academy_offering_command_keys"),1);
});
test("published source terms/components reject legacy edits, legacy new plans and retired reactivation",async()=>{
 const offering=await actions.createProgrammeOffering(create());const first=await actions.publishFeePlan(fee(offering.reference));
 assert.throws(()=>db.prepare("UPDATE academy_fee_plans SET monthly_amount_paisa=1 WHERE id=?").run(first.reference),/immutable|consistent state/);
 assert.throws(()=>db.prepare("UPDATE academy_fee_plan_components SET amount_paisa=1 WHERE plan_id=?").run(first.reference),/cannot change/);
 assert.throws(()=>db.prepare("DELETE FROM academy_fee_plan_components WHERE plan_id=?").run(first.reference),/cannot change/);
 assert.throws(()=>db.prepare("INSERT INTO academy_fee_plans(id,offering_id,title,monthly_amount_paisa,admission_amount_paisa,active) VALUES (?,?,'Legacy overwrite',1,0,1)").run(uuid(),offering.reference),/source Fee Plan/);
 const second=await actions.publishFeePlan(fee(offering.reference));assert.equal(second.ok,true);
 assert.throws(()=>db.prepare("UPDATE academy_fee_plans SET active=1,source_status='ACTIVE' WHERE id=?").run(first.reference),/immutable/);
});
test("public controls use real stable subject IDs, audit once despite triggers, and preserve failures",async()=>{
 const offering=await actions.createProgrammeOffering(create());await actions.publishFeePlan(fee(offering.reference));
 const input=publicInput(offering.reference);const result=await actions.updateProgrammeOfferingPublicControls(input);assert.equal(result.ok,true);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM academy_offering_subjects WHERE offering_id=? AND subject_id='physics'").get(offering.reference).n,1);
 assert.deepEqual(JSON.parse(db.prepare("SELECT subjects_json FROM public_programme_offerings WHERE id=?").get(offering.reference).subjects_json),[{id:"physics",code:"PHY",name:"Physics"}]);
 const n=count("erp_audit_events");assert.deepEqual(await actions.updateProgrammeOfferingPublicControls(input),result);assert.equal(count("erp_audit_events"),n);
 assert.equal((await actions.updateProgrammeOfferingPublicControls(publicInput(offering.reference,{subjectIds:["not-a-real-subject"]}))).ok,false);
 assert.equal(count("erp_audit_events"),n);
});
test("academic and website viewers cannot fetch fee amounts without finance permission",async()=>{
 permissions=["academics.view"];queries=[];
 const data=await reads.getOfferingOverview();assert.deepEqual(data.plans,[]);assert.deepEqual(data.components,[]);
 assert(!queries.some(q=>/FROM academy_fee_plans|FROM academy_fee_plan_components/.test(q)));
 permissions=["academics.manage"];queries=[];
 await reads.getWebsiteOfferings();assert(!queries.some(q=>/FROM academy_fee_plans|FROM academy_fee_plan_components/.test(q)));
});
test("offering retirement closes public intake and reactivation requires a valid plan",async()=>{
 const offering=await actions.createProgrammeOffering(create());let result=await state.changeRecordState({entity:"offering",id:offering.reference,active:true,reason:"Verified reactivation attempt"});assert.equal(result.ok,false);
 await actions.publishFeePlan(fee(offering.reference));await actions.updateProgrammeOfferingPublicControls(publicInput(offering.reference));
 result=await state.changeRecordState({entity:"offering",id:offering.reference,active:false,reason:"End the current intake"});assert.equal(result.ok,true);
 const row=db.prepare("SELECT * FROM public_programme_offerings WHERE id=?").get(offering.reference);assert.equal(row.is_active,0);assert.equal(row.show_on_website,0);assert.equal(row.is_accepting_applications,0);assert.equal(row.application_state,"CLOSED");
 assert.equal((await state.changeRecordState({entity:"offering",id:offering.reference,active:true,reason:"Verified reopening of cohort"})).ok,true);
});
test("discount policy requires billing authority and uses a current optimistic revision",async()=>{
 permissions=["academics.manage"];
 assert.equal((await discount.saveOfferingDiscountPolicy({offeringId:"sa-ssc-science",percentages:[5,10]})).ok,false);
 permissions.push("finance.billing.manage");
 assert.equal((await discount.saveOfferingDiscountPolicy({offeringId:"sa-ssc-science",percentages:[10,5,10]})).ok,true);
 assert.deepEqual(JSON.parse(db.prepare("SELECT allowed_discount_percentages_json FROM public_programme_offerings WHERE id='sa-ssc-science'").get().allowed_discount_percentages_json),[5,10]);
 const n=count("erp_audit_events");beforeBatch=()=>db.exec("UPDATE public_programme_offerings SET version=version+1 WHERE id='sa-ssc-science'");
 assert.equal((await discount.saveOfferingDiscountPolicy({offeringId:"sa-ssc-science",percentages:[15]})).ok,false);assert.equal(count("erp_audit_events"),n);
});
test("a component constraint failure rolls back offering activation, old fees and command key",async()=>{
 const offering=await actions.createProgrammeOffering(create());const first=await actions.publishFeePlan(fee(offering.reference));
 db.exec("CREATE TRIGGER force_component_failure BEFORE INSERT ON academy_fee_plan_components BEGIN SELECT RAISE(ABORT,'synthetic component constraint'); END");
 const previous=db.prepare("SELECT version FROM public_programme_offerings WHERE id=?").get(offering.reference).version;
 const n=count("academy_offering_command_keys");assert.equal((await actions.publishFeePlan(fee(offering.reference))).ok,false);
 assert.equal(db.prepare("SELECT version FROM public_programme_offerings WHERE id=?").get(offering.reference).version,previous);assert.equal(count("academy_offering_command_keys"),n);
 assert.equal(db.prepare("SELECT active FROM academy_fee_plans WHERE id=?").get(first.reference).active,1);
});

test("fee form defaults preserve the monthly/non-monthly due-day invariant",()=>{
 assert.equal(defaultDueDay(),10);assert.equal(defaultDueDay('MONTHLY',15),15);
 assert.equal(defaultDueDay('TERM',null),null);assert.equal(defaultDueDay('ONE_TIME',null),null);
 assert.equal(defaultDueDay('TERM',15),null);assert.equal(defaultDueDay('ONE_TIME',15),null);
});
