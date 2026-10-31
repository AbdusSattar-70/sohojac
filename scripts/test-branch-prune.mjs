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
 assert.equal(r.deletes.length,7);
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
