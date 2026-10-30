import { databaseTargets, requireDevelopmentDatabaseId } from "../lib/database-target.ts";
import fs from "node:fs";

/**
 * Provision the independent sohojac_dev D1 exactly once, or resolve it by name.
 * Executed ONLY in the dev release job, with D1 Edit + Workers Read.
 * Never imports production data, reuses the old hyphenated DB, or deletes a DB.
 */
const { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token } = process.env;
if (process.env.GITHUB_REF !== databaseTargets.development.branch ||
    !account || !token || !process.env.GITHUB_ENV) {
  throw Error("Only an authenticated dev branch release may provision development D1.");
}
const api = "https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(account);

async function request(route, options = {}) {
  const response = await fetch(api + route, {
    ...options,
    headers: {
      Authorization: "Bearer " + token,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || json?.success !== true) {
    throw Error("Cloudflare API request failed (" + response.status + ") for dev provisioning.");
  }
  return json;
}

async function findDevDatabase() {
  let page = 1;
  while (page <= 100) {
    const json = await request("/d1/database?per_page=100&page=" + page);
    if (!Array.isArray(json.result)) throw Error("Unexpected D1 list response.");
    const matches = json.result.filter(x => x.name === databaseTargets.development.name);
    if (matches.length !== 0) {
      if (matches.length !== 1) throw Error("Duplicate dev database names; manual resolution required.");
      return matches[0];
    }
    if (page >= Number(json.result_info?.total_pages || 1)) break;
    page++;
  }
  return null;
}
let database = await findDevDatabase();
if (!database) {
  try {
    const created = await request("/d1/database", {
      method: "POST",
      body: JSON.stringify({ name: databaseTargets.development.name }),
    });
    database = created.result;
  } catch (error) {
    // A concurrent provisioning run may have created the database. Re-query.
    database = await findDevDatabase();
    if (!database) throw error;
  }
}
if (database?.name !== databaseTargets.development.name) throw Error("Dev DB identity mismatch.");
const id = requireDevelopmentDatabaseId(database.uuid);
const verified = (await request("/d1/database/" + encodeURIComponent(id))).result;
if (verified?.name !== databaseTargets.development.name ||
    verified?.uuid !== id) throw Error("Cannot verify independent development D1.");
const subdomain = (await request("/workers/subdomain")).result?.subdomain;
if (typeof subdomain !== "string" || !/^[a-z0-9-]+$/.test(subdomain)) {
  throw Error("Could not confirm workers.dev hostname.");
}
const url = "https://sohojac-dev." + subdomain + ".workers.dev";
for (const [key, value] of Object.entries({
  SOHOJAC_DEV_D1_ID: id,
  SOHOJAC_D1_ID: id,
  BETTER_AUTH_URL: url,
  NEXT_PUBLIC_SITE_URL: url,
})) fs.appendFileSync(process.env.GITHUB_ENV, key + "=" + value + "\n");
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, "url=" + url + "\n");
console.log("Verified isolated development D1 name and ID, and dev Worker hostname.");
