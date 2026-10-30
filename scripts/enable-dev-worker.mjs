import { databaseTargets, requireDevelopmentDatabaseId } from "../lib/database-target.ts";
/** Activate only the isolated dev Worker; never target production D1. */
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!account || !token || process.env.GITHUB_REF !== databaseTargets.development.branch)
  throw Error("Dev Worker activation requires a verified dev release.");
const databaseId = requireDevelopmentDatabaseId(process.env.SOHOJAC_DEV_D1_ID);
if (process.env.SOHOJAC_D1_ID !== databaseId)
  throw Error("Unexpected dev database target; refusing route activation.");
const endpoint =
  "https://api.cloudflare.com/client/v4/accounts/" +
  encodeURIComponent(account) +
  "/workers/scripts/sohojac-dev/subdomain";
const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ enabled: true, previews_enabled: true }),
});
const json = await response.json().catch(() => null);
if (!response.ok || json?.success !== true || json?.result?.enabled !== true)
  throw Error(
    "Could not activate the dev Worker workers.dev route (HTTP " +
      response.status +
      "). Check Workers Scripts Edit access.",
  );
console.log("Enabled workers.dev routing for sohojac-dev only.");
