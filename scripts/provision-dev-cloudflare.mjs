/**
 * GitHub Actions-only provisioning of a disposable, isolated test environment.
 * It NEVER queries/migrates the production D1. API token is read from secrets,
 * not passed in shell args or written to disk. Reuses the same dev DB by name.
 */
import fs from "node:fs";
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token||!process.env.GITHUB_ENV)throw Error(
 "Development deployment needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN Actions secrets."
);
const prodId="d6f3e4e9-2190-43bf-bc90-969687f6db78";
const api="https://api.cloudflare.com/client/v4/accounts/"+encodeURIComponent(account);
async function request(url, options={}){
 const response=await fetch(url,{
  ...options,headers:{Authorization:"Bearer "+token,
   ...options.body?{"Content-Type":"application/json"}:{},
   ...options.headers}
 });
 const json=await response.json().catch(()=>null);
 if(!response.ok||json?.success!==true)
  throw Error("Cloudflare API operation failed (HTTP "+response.status+
   "). Check Workers Scripts/D1 permissions and account ID.");
 return json.result;
}
const databaseName="sohojac-dev";
let db;
const list=await request(api+"/d1/database?per_page=100");
if(!Array.isArray(list))throw Error("Cloudflare D1 list format is unexpected.");
db=list.find(item=>item.name===databaseName);
if(!db){
 db=await request(api+"/d1/database",{
  method:"POST",body:JSON.stringify({name:databaseName,primary_location_hint:"apac"})
 });
 console.log("Created isolated D1 for ERP development (no live data copied).");
}
const id=db.uuid;
if(typeof id!=="string"||!/^[a-f0-9-]{36}$/i.test(id)||id===prodId)
 throw Error("Invalid or production database ID; staging deploy blocked.");
const result=await request(api+"/workers/subdomain");
const subdomain=result?.subdomain;
if(typeof subdomain!=="string"||!/^[a-z0-9-]+$/.test(subdomain))
 throw Error("Could not find account workers.dev subdomain.");
const url="https://sohojac-dev."+subdomain+".workers.dev";
for(const [key,value] of Object.entries({
 SOHOJAC_DEV_D1_ID:id,
 BETTER_AUTH_URL:url,
 NEXT_PUBLIC_SITE_URL:url,
})){
 fs.appendFileSync(process.env.GITHUB_ENV,key+"="+value+"\n");
}
if(process.env.GITHUB_OUTPUT){
 fs.appendFileSync(process.env.GITHUB_OUTPUT,"url="+url+"\n");
}
console.log("Staging Worker: "+url);
console.log("Bound to independent D1: "+databaseName);
