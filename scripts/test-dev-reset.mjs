import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { databaseTargets } from "../lib/database-target.ts";

const source=readFileSync("scripts/reset-old-dev-d1-once.mjs","utf8").replace(/^import[^\n]*\n/gm,"");
const execute=new (Object.getPrototypeOf(async function(){}).constructor)(
  "fetch","process","console","databaseTargets",source);
const oldId="f6331cbc-fff5-43be-9588-2269d8942342";
const newId="88888888-8888-4888-8888-888888888888";
const base="https://api.cloudflare.com/client/v4/accounts/synthetic-dev-account";
const goodEnv={GITHUB_REF:"refs/heads/dev",CANONICAL_DEV_RESET_APPROVAL:"RESET_OLD_SOHOJAC_DEV_ONCE",
 CLOUDFLARE_ACCOUNT_ID:"synthetic-dev-account",CLOUDFLARE_API_TOKEN:"synthetic-local-token"};
async function simulate(options={}){
 const calls=[],logs=[],exit=Symbol("mock exit");
 const env={...goodEnv,...options.env};
 const currentId=options.currentId??oldId;
 const production=options.production??{uuid:databaseTargets.production.id,name:"sohojac"};
 const fetch=async(url,init={})=>{
   const method=init.method??"GET";calls.push({url,method});
   let result;
   if(url===base+"/d1/database/"+databaseTargets.production.id&&method==="GET")result=production;
   else if(url===base+"/d1/database?per_page=100&page=1")result=[{uuid:currentId,name:"sohojac_dev"}];
   else if(url===base+"/d1/database/"+oldId&&method==="GET")result={uuid:oldId,name:options.oldName??"sohojac_dev"};
   else if(url===base+"/d1/database/"+oldId&&method==="DELETE")result={};
   else throw Error("Unexpected Cloudflare API call: "+method+" "+url);
   return Response.json({success:true,result,result_info:{total_pages:1}});
 };
 let error;
 try{await execute(fetch,{env,exit(n){assert.equal(n,0);throw exit;}},{log:x=>logs.push(x)},databaseTargets);}
 catch(e){if(e!==exit)error=e;}
 return {calls,logs,error,deletes:calls.filter(x=>x.method==="DELETE")};
}
test("one-time reset deletes only original isolated DEV UUID, never production",async()=>{
 const result=await simulate();
 assert.equal(result.error,undefined);
 assert.equal(result.deletes.length,1);
 assert.equal(result.deletes[0].url,base+"/d1/database/"+oldId);
 assert(!result.calls.some(x=>x.method==="DELETE"&&x.url.includes(databaseTargets.production.id)));
});
test("replacement DEV UUID is preserved on all later runs",async()=>{
 const result=await simulate({currentId:newId});
 assert.equal(result.error,undefined);
 assert.equal(result.deletes.length,0);
});
for(const [label,options] of [
 ["production branch",{env:{GITHUB_REF:"refs/heads/master"}}],
 ["missing explicit reset authorization",{env:{CANONICAL_DEV_RESET_APPROVAL:""}}],
 ["missing API token",{env:{CLOUDFLARE_API_TOKEN:""}}],
 ["changed production D1 metadata",{production:{uuid:databaseTargets.production.id,name:"sohojac_dev"}}],
 ["unexpected old development D1 name",{oldName:"sohojac"}],
]){
 test("one-time reset rejects "+label+" before DELETE",async()=>{
   const result=await simulate(options);
   assert(result.error);
   assert.equal(result.deletes.length,0);
 });
}
