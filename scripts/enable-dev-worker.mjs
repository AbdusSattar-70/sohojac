import { sharedD1 } from "../lib/database-target.ts";
/** Enable only the dev Worker; its D1 is intentionally shared. */
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!account || !token || !process.env.SOHOJAC_D1_ID)
  throw Error("Missing shared database deployment context.");
if (process.env.SOHOJAC_D1_ID !== sharedD1.id)
  throw Error("Unexpected database target; refusing route activation.");
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
