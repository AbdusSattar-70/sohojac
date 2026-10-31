import {databaseTargets,requireDevelopmentDatabaseId} from "../lib/database-target.ts";

/**
 * Owner-authorized, one-time mock-data rebuild for the single-Subject schema.
 * Triggered only by the tested dev release, never by pull requests or master.
 * Existing dev OWNER login and mock data will be erased.
 */
const {CLOUDFLARE_ACCOUNT_ID:account,CLOUDFLARE_API_TOKEN:token,GITHUB_REF:ref}=process.env;
if(ref!=="refs/heads/dev"||!account||!token||!process.env.GITHUB_ACTIONS)
  throw Error("Only an authenticated dev GitHub Actions release may rebuild development D1.");
const base="https://api.cloudflare.com/client/v4/accounts/"+encodeURIComponent(account);
async function call(route,opts={}){
  const res=await fetch(base+route,{
    method:opts.method??"GET",
    headers:{Authorization:"Bearer "+token,...(opts.body?{"Content-Type":"application/json"}:{})},
    ...(opts.body?{body:JSON.stringify(opts.body)}:{})
  });
  const json=await res.json().catch(()=>null);
  if(!res.ok||json?.success!==true)throw Error("D1 dev rebuild request failed: HTTP "+res.status+" ("+opts.method+")");
  return json.result;
}
let current=null;
for(let page=1;page<=25;page++){
  const res=await fetch(base+"/d1/database?per_page=100&page="+page,{headers:{Authorization:"Bearer "+token}});
  const json=await res.json().catch(()=>null);
  if(!res.ok||json?.success!==true||!Array.isArray(json.result))throw Error("Cannot safely list development D1.");
  const matches=json.result.filter(x=>x.name===databaseTargets.development.name);
  if(matches.length>1)throw Error("Ambiguous development D1 names; rebuild refused.");
  if(matches.length===1){current=matches[0];break;}
  if(page>=Number(json.result_info?.total_pages??1))break;
}
if(!current){console.log("No existing dev D1: normal provisioning will create a clean database.");process.exit(0);}
const id=requireDevelopmentDatabaseId(current.uuid);
const meta=await call("/d1/database/"+encodeURIComponent(id));
if(meta?.name!==databaseTargets.development.name||meta?.uuid!==id)
  throw Error("Independent dev D1 name and UUID mismatch.");
const query=async sql=>{
  const result=await call("/d1/database/"+encodeURIComponent(id)+"/query",{method:"POST",body:{sql,params:[]}});
  if(!Array.isArray(result)||result.some(x=>x.success===false))throw Error("Cannot inspect development D1.");
  return result[0]?.results??[];
};
const migrations=(await query("SELECT name FROM d1_migrations ORDER BY name")).map(x=>x.name);
const existingMasters=await query("SELECT name FROM sqlite_schema WHERE type='table' AND name='academy_subjects'");
const original=["0001_schema_tables.sql","0002_schema_indexes.sql","0003_domain_guards.sql","0004_finance_reference.sql"];
const clean=migrations.length===4&&migrations.every((x,i)=>x===original[i])&&existingMasters.length===0;
if(clean){console.log("Development D1 already has the clean four-file Subject schema; no reset.");process.exit(0);}
const previousFour=migrations.length===4&&migrations.every((x,i)=>x===original[i])&&existingMasters.length===1;
const previousFive=migrations.length===5&&migrations.slice(0,4).every((x,i)=>x===original[i])&&migrations[4]==="0005_single_global_subject.sql";
if(!previousFour&&!previousFive)throw Error("Unexpected dev D1 migration state; will not delete an unrecognized database.");
// A fresh environment with this exact name is the only supported deletion target.
console.log("Old mock-only dev schema verified. Deleting its D1 database to build a clean Subject baseline.");
await call("/d1/database/"+encodeURIComponent(id),{method:"DELETE"});
for(let attempt=0;attempt<12;attempt++){
  const response=await fetch(base+"/d1/database/"+encodeURIComponent(id),{headers:{Authorization:"Bearer "+token}});
  if(response.status===404){console.log("Obsolete mock dev D1 removed. Provisioner can now create a fresh sohojac_dev.");process.exit(0);}
  await new Promise(resolve=>setTimeout(resolve,2000));
}
throw Error("Dev D1 removal not yet confirmed; refusing to provision or deploy.");
