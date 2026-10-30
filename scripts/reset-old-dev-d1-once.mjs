import { databaseTargets } from "../lib/database-target.ts";

/**
 * ONE-TIME, explicit reset of the isolated 31 Oct 2026 development D1 only.
 *
 * This is not a generic database deletion utility. Exactly the original
 * development D1 UUID is allowed; production and any replacement UUID are
 * impossible deletion targets. After the first successful reset the script is
 * a no-op on later dev deployments. It must never be called by master.
 */
const OLD_DEV_ID = "f6331cbc-fff5-43be-9588-2269d8942342";
const { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token } = process.env;
if (process.env.GITHUB_REF !== "refs/heads/dev" ||
    process.env.CANONICAL_DEV_RESET_APPROVAL !== "RESET_OLD_SOHOJAC_DEV_ONCE" ||
    !account || !token) {
  throw Error("Refusing development reset: exact authorized dev branch, approval and Cloudflare credentials are required.");
}
if (OLD_DEV_ID === databaseTargets.production.id || OLD_DEV_ID === databaseTargets.development.id) {
  throw Error("Unsafe developer reset constants.");
}
const base = "https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(account);
async function request(route, options={}) {
  const response = await fetch(base+route, {
    ...options,
    headers: {Authorization:"Bearer "+token,...(options.body?{"Content-Type":"application/json"}:{}),...options.headers},
  });
  const j = await response.json().catch(()=>null);
  if (!response.ok || j?.success !== true)
    throw Error("Cloudflare D1 identity/reset request rejected ("+response.status+").");
  return j.result;
}
const production = await request("/d1/database/"+databaseTargets.production.id);
if (production?.uuid !== databaseTargets.production.id || production?.name !== databaseTargets.production.name)
  throw Error("Production database identity did not match expected protected target; aborting.");
let page=1, match=null;
while(page<=100){
  const r = await fetch(base+"/d1/database?per_page=100&page="+page,{headers:{Authorization:"Bearer "+token}});
  const j=await r.json().catch(()=>null);
  if(!r.ok||j?.success!==true||!Array.isArray(j.result)) throw Error("Cannot enumerate dev D1 safely.");
  const found=j.result.filter(x=>x.name===databaseTargets.development.name);
  if(found.length>1 || (found.length && match))throw Error("Ambiguous dev DB identity.");
  if(found.length)match=found[0];
  if(page>=Number(j.result_info?.total_pages||1))break;
  page++;
}
if(!match){ console.log("Old dev D1 already absent; dev provisioner will create a new isolated DB.");process.exit(0);}
if(match.uuid !== OLD_DEV_ID){
  if(match.uuid===databaseTargets.production.id) throw Error("Dev name points at production DB; refusing.");
  // The old UUID can never be deleted again; any new UUID is preserved.
  console.log("Original development D1 already replaced. Keeping current sohojac_dev unchanged.");
  process.exit(0);
}
const exact=await request("/d1/database/"+OLD_DEV_ID);
if(exact?.name!==databaseTargets.development.name||exact?.uuid!==OLD_DEV_ID)
  throw Error("Failed to verify the EXACT old development D1 before reset.");
await request("/d1/database/"+OLD_DEV_ID,{method:"DELETE"});
console.log("Deleted ONLY the original dev database UUID. Production sohojac D1 was not changed.");
console.log("The existing dev provisioning step will create the clean replacement sohojac_dev.");
