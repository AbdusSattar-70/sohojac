import { sharedD1 } from "../lib/database-target.ts";
import fs from "node:fs";
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!account || !token || !process.env.GITHUB_ENV)
  throw Error(
    "Development deployment needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN Actions secrets.",
  );
const api =
  "https://api.cloudflare.com/client/v4/accounts/" +
  encodeURIComponent(account);
async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: "Bearer " + token,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || json?.success !== true)
    throw Error(
      "Cloudflare API operation failed (HTTP " +
        response.status +
        "). Check Workers Scripts/D1 permissions and account ID.",
    );
  return json.result;
}
const database = await request(api + "/d1/database/" + sharedD1.id);
if (database?.name !== sharedD1.name)
  throw Error("Expected shared sohojac D1 was not confirmed.");
const result = await request(api + "/workers/subdomain");
const subdomain = result?.subdomain;
if (typeof subdomain !== "string" || !/^[a-z0-9-]+$/.test(subdomain))
  throw Error("Could not find account workers.dev subdomain.");
const url = "https://sohojac-dev." + subdomain + ".workers.dev";
for (const [key, value] of Object.entries({
  SOHOJAC_D1_ID: sharedD1.id,
  BETTER_AUTH_URL: url,
  NEXT_PUBLIC_SITE_URL: url,
})) {
  fs.appendFileSync(process.env.GITHUB_ENV, key + "=" + value + "\n");
}
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, "url=" + url + "\n");
}
console.log("Staging Worker: " + url);
console.log("Both deployments use the one shared D1: " + sharedD1.name);
