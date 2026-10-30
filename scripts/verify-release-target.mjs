import { databaseTargets, assertDatabaseRelease, requireDevelopmentDatabaseId } from "../lib/database-target.ts";

const release = process.argv[2];
if (!["development", "production"].includes(release)) throw Error("Usage: node scripts/verify-release-target.mjs development|production [--worker]");
const { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token } = process.env;
if (!account || !token) throw Error("Cloudflare release verification requires credentials.");
const id = release === "production"
  ? databaseTargets.production.id
  : requireDevelopmentDatabaseId(process.env.SOHOJAC_DEV_D1_ID);
assertDatabaseRelease(release, process.env.GITHUB_REF, id);
if (process.env.SOHOJAC_D1_ID && process.env.SOHOJAC_D1_ID !== id) {
  throw Error("Release environment D1 ID mismatch. No deployment is permitted.");
}
const target = databaseTargets[release];
const base = "https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(account);
async function cf(route) {
  const res = await fetch(base + route, { headers: { Authorization: "Bearer " + token } });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.success !== true) throw Error("Cloudflare target check failed: HTTP " + res.status);
  return body.result;
}
const database = await cf("/d1/database/" + encodeURIComponent(id));
if (database?.uuid !== id || database?.name !== target.name)
  throw Error("Cloudflare D1 name/UUID mismatch: refusing release.");
if (process.argv.includes("--worker")) {
  const settings = await cf("/workers/scripts/" + encodeURIComponent(target.worker) + "/settings");
  const binding = settings?.bindings?.find(x => x.name === "DB" && x.type === "d1");
  if ((binding?.id ?? binding?.database_id) !== id)
    throw Error("Deployed " + target.worker + " DB binding mismatch.");
}
console.log(release + " D1 name/ID " + (process.argv.includes("--worker") ? "and Worker binding " : "") + "verified.");
