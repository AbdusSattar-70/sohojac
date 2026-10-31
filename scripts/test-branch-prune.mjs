import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync("scripts/prune-closed-feature-branches.mjs","utf8");
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const runScript=new AsyncFunction("fetch","process","console",source);
const repo="AbdusSattar-70/sohojac";
const head="33333333-3333-4333-8333-333333333333";
const entries=[
 ["docs/operator-first-erp-blueprint-20261031","ca1f24d804ed01e962b978bd45e9372a24fe36ad",51,false],
 ["feature/canonical-dev-baseline","35ff61749ae9c51fcf497854bff209f0fdc7efc8",53,true],
 ["feature/operator-first-erp","ce2d0354c4710c43aae63137fbd4eee206c60c93",52,true],
 ["feature/operator-first-programme-launch","51c8707f89b20aa1cfc7b30dc54eb3193d976af0",54,true],
 ["fix/programme-launch-final-readiness","c750eca7b79cb1f04536c4fee516f8224f185fd9",55,true],
 ["feature/operator-first-subject-catalogue","aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",56,true],
 ["fix/pinned-historical-ci-fixtures","c039b34beb3bff903320cd0753860e8aa915f1c6",57,false],
 ["feature/c2b-subject-impact-review","ed042dbdb9c3a519938083c730a1203af89c27cb",58,true],
 ["feature/c3-academic-year-conflict-guards","e7930924054194614fcd7bce129bf2a1907570e7",59,true],
 ["feature/c3b-master-data-versions","9b1a06f3a648cf7ec3d7ce1fdd0e02bf1a2bbb62",61,true],
 ["feature/c4-today-daily-work","9945994a3d056d179520dc4bfb5226ac6e215b33",62,true],
 ["feature/c5a-finance-reconciliation","8cb91b4963e4490031e0dc6e5bde35b5f886a52e",63,true],
 ["feature/c5b-safe-sms-outbox","d4f055874dfc152ec08df8202416c32166ec0ca3",65,true],
 ["feature/fix-dev-clean-schema-guard","defe8f47b6614b24afa00498fb8d884e825ca7f4",64,true],
 ["feature/single-subject-master-clean-slate","cccd0a20c4682581ec3f07276a261abbe48e2565",60,true],
 ["feature/c5c-guardian-message-safety","a77d677e2e0314ce77d4a839c7de8c88daa9d65d",66,true],
 ["feature/c6-recovery-rehearsal","2af822ec615c42f62c2fb386ca86e05a2c571cf2",67,true],
];
async function simulate({env={},open=[],changed={},missing=[]}={}){
 const deletes=[],messages=[];
 const prs=entries.map(([name,sha,number,merged])=>({
  number,state:"closed",head:{ref:name,sha},base:{ref:"dev"},
  merged_at:merged?"2026-10-31T00:00:00Z":null,
 }));
 const fetch=async(url,options={})=>{
  const method=options.method??"GET";
  const path=new URL(url).pathname.replace("/repos/"+repo,"");
  if(path==="/git/ref/heads/dev") return Response.json({ref:"refs/heads/dev",object:{sha:head}});
  if(path==="/pulls"&&new URL(url).searchParams.get("state")==="open")return Response.json(open);
  if(path==="/pulls"&&new URL(url).searchParams.get("state")==="closed")return Response.json(prs);
  for(const [name,sha] of entries){
   const enc=name.split("/").map(encodeURIComponent).join("/");
   if(path==="/git/ref/heads/"+enc){
    if(missing.includes(name))return Response.json({message:"Not found"},{status:404});
    return Response.json({ref:"refs/heads/"+name,object:{sha:changed[name]??sha}});
   }
   if(path==="/git/refs/heads/"+enc && method==="DELETE"){
    deletes.push(name);
    return new Response(null,{status:204});
   }
  }
  throw Error("Unexpected call: "+method+" "+path);
 };
 let error;
 try{
  await runScript(fetch,{env:{
    GITHUB_REPOSITORY:repo,GITHUB_TOKEN:"mock-only-token",GITHUB_REF:"refs/heads/dev",
    GITHUB_SHA:head,...env,
  }},{log:message=>messages.push(message)});
 }catch(e){error=e;}
 return {deletes,messages,error};
}
test("only exact verified closed PR heads are deleted, never master or dev",async()=>{
 const r=await simulate();
 assert.equal(r.error,undefined);
 assert.equal(r.deletes.length,entries.length);
 assert(!r.deletes.includes("dev")&&!r.deletes.includes("master"));
});
test("open PR and changed branch SHA are protected against cleanup",async()=>{
 const r=await simulate({
  open:[{head:{ref:"feature/operator-first-subject-catalogue"}}],
  changed:{"feature/operator-first-erp":"99999999-9999-4999-8999-999999999999"},
 });
 assert.equal(r.error,undefined);
 assert(!r.deletes.includes("feature/operator-first-erp"));
 assert(!r.deletes.includes("feature/operator-first-subject-catalogue"));
});
test("missing branch is a harmless already-completed cleanup",async()=>{
 const r=await simulate({missing:["feature/canonical-dev-baseline"]});
 assert.equal(r.error,undefined);
 assert(!r.deletes.includes("feature/canonical-dev-baseline"));
});
test("wrong branch, missing credentials or unexpected repository fail before deletion",async()=>{
 for(const env of [
  {GITHUB_REF:"refs/heads/master"},
  {GITHUB_TOKEN:""},
  {GITHUB_REPOSITORY:"another/project"},
 ]) {
  const r=await simulate({env});
  assert(r.error);
  assert.equal(r.deletes.length,0);
 }
});
