import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { databaseTargets, requireDevelopmentDatabaseId } from "../lib/database-target.ts";
import { devReferenceSeedSql } from "./canonical-dev-bootstrap.mjs";

const root = new URL("../", import.meta.url);
const src = await readFile(new URL("scripts/seed-dev-reference.mjs",root),"utf8");
const names = (await readdir(new URL("migrations/",root))).filter(n=>/^\d{4}_.*\.sql$/.test(n)).sort();
const migrations = await Promise.all(names.map(n=>readFile(new URL("migrations/"+n,root),"utf8")));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const execute=new AsyncFunction("fetch","process","console","devReferenceSeedSql","databaseTargets",
  "requireDevelopmentDatabaseId",src.replace(/^import[^\n]*\n/gm,""));
const devId="11111111-1111-4111-8111-111111111111";
const response=result=>Response.json({success:true,result});
function fixture(){
  const db=new DatabaseSync(":memory:");db.exec("PRAGMA foreign_keys=ON");
  for(const sql of migrations)db.exec(sql);
  return db;
}
async function run(db,options={}){
  const mutations=[],queries=[];
  const environment={CLOUDFLARE_ACCOUNT_ID:"dev-test-account",CLOUDFLARE_API_TOKEN:"local-ephemeral-token",
    GITHUB_REF:"refs/heads/dev",SOHOJAC_DEV_D1_ID:devId,SOHOJAC_D1_ID:devId,...options.env};
  let error;const exited=Symbol("exited");
  async function fetch(url,opts={}){
    const base="https://api.cloudflare.com/client/v4/accounts/dev-test-account/d1/database/"+devId;
    if(url===base)return response(options.metadata??{uuid:devId,name:"sohojac_dev"});
    assert.equal(url,base+"/query");
    const {sql,params}=JSON.parse(opts.body);assert.deepEqual(params,[]);
    queries.push(sql);
    if(/^SELECT\b/.test(sql))return response([{success:true,results:db.prepare(sql).all()}]);
    mutations.push(sql);
    db.exec("BEGIN");
    try{db.exec(sql);db.exec("COMMIT");}catch(e){db.exec("ROLLBACK");throw e;}
    return response([{success:true,results:[]}]);
  }
  try{
    await execute(fetch,{env:environment,exit(code){assert.equal(code,0);throw exited;}},{log(){}},
      devReferenceSeedSql,databaseTargets,requireDevelopmentDatabaseId);
  }catch(e){if(e!==exited)error=e;}
  return {error,mutations,queries};
}
test("canonical fresh dev accepts reference seed without removing any business records",async()=>{
  const db=fixture();try{
    const result=await run(db);assert.equal(result.error,undefined);
    assert.equal(result.mutations.length,2,"One additive seed and one completion marker");
    assert.equal(result.mutations.some(q=>/DELETE\s+FROM|DROP\s+TABLE/i.test(q)),false);
    assert.equal(db.prepare("SELECT count(*) n FROM academy_classes").get().n,12);
    assert.equal(db.prepare("SELECT count(*) n FROM academy_guardian_relationships").get().n,27);
    assert(db.prepare("SELECT count(*) n FROM academic_subjects").get().n>=20);
    assert.equal(db.prepare("SELECT count(*) n FROM academy_offering_subjects").get().n,0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_schema WHERE name='academy_subjects'").get().n,0);
    assert.equal(db.prepare("SELECT count(*) n FROM public_programme_offerings").get().n,0);
    assert.equal(db.prepare('SELECT count(*) n FROM "user"').get().n,0);
    assert.equal(db.prepare("SELECT count(*) n FROM finance_payments").get().n,0);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
    assert.equal(db.prepare("SELECT status FROM system_maintenance_operations WHERE id='canonical-reference-seed-v1'").get().status,"COMPLETE");
    db.exec("UPDATE academy_classes SET name='Operator-accepted class' WHERE code='CLASS1'");
    const replay=await run(db);assert.equal(replay.error,undefined);
    assert.equal(replay.mutations.length,0);
    assert.equal(db.prepare("SELECT name FROM academy_classes WHERE code='CLASS1'").get().name,"Operator-accepted class");
  }finally{db.close();}
});
test("canonical seed refuses pre-existing identity and business data",async()=>{
  for(const insert of [
    `INSERT INTO "user"(id,name,email,"createdAt","updatedAt") VALUES('actor','Test','actor@example.invalid',0,0)`,
    `INSERT INTO public_enquiries(id,reference,intent,student_name,class_name,guardian_name,mobile,consent_at) VALUES('enquiry','DEV-ENQ','interest','Student','Class 8','Guardian','01700000000','2026-10-31')`,
    `INSERT INTO academy_students(id,student_no,full_name,guardian_name,guardian_mobile) VALUES('student','SA-DEV-0001','Student','Guardian','01700000000')`,
  ]){
    const db=fixture();try{
      db.exec(insert);const before=db.prepare("SELECT count(*) n FROM academy_classes").get().n;
      const result=await run(db);assert.match(result.error?.message??"",/existing staff or business records/);
      assert.equal(result.mutations.length,0);
      assert.equal(db.prepare("SELECT count(*) n FROM academy_classes").get().n,before);
    }finally{db.close();}
  }
});
for(const [name,options] of [
  ["production branch",{env:{GITHUB_REF:"refs/heads/master"}}],
  ["production DB UUID",{env:{SOHOJAC_DEV_D1_ID:databaseTargets.production.id,SOHOJAC_D1_ID:databaseTargets.production.id}}],
  ["mismatched DB UUID",{env:{SOHOJAC_D1_ID:databaseTargets.production.id}}],
  ["missing token",{env:{CLOUDFLARE_API_TOKEN:""}}],
  ["wrong database name",{metadata:{uuid:devId,name:"sohojac"}}],
]){
  test("dev reference seed refuses "+name,async()=>{
    const db=fixture();try{
      const result=await run(db); // Smoke baseline before invalid case
      assert.equal(result.error,undefined);
    }finally{db.close();}
    const bad=fixture();try{
      const result=await run(bad,options);assert(result.error,"must refuse "+name);
      assert.equal(result.mutations.length,0);
    }finally{bad.close();}
  });
}
