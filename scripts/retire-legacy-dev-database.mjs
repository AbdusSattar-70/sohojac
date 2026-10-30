import fs from "node:fs";
import path from "node:path";
import { sharedD1 } from "../lib/database-target.ts";
const legacyId = "1d470521-6146-46c2-ab55-557ad2a27d6c";
const account = process.env.CLOUDFLARE_ACCOUNT_ID,
  token = process.env.CLOUDFLARE_API_TOKEN;
if (
  !account ||
  !token ||
  process.env.GITHUB_REF !== "refs/heads/dev" ||
  process.env.SOHOJAC_D1_ID !== sharedD1.id ||
  !process.env.RUNNER_TEMP
)
  throw Error(
    "Legacy database retirement requires a verified dev release using shared sohojac D1.",
  );
const base = `https://api.cloudflare.com/client/v4/accounts/${account}`;
async function api(route, method = "GET") {
  const response = await fetch(base + route, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (method === "GET" && response.status === 404) return null;
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success !== true)
    throw Error(
      `Legacy D1 retirement API failed: HTTP ${response.status}. Shared sohojac is never a deletion target.`,
    );
  return body.result;
}
const legacy = await api(`/d1/database/${legacyId}`);
if (legacy) {
  if (
    legacy.uuid !== legacyId ||
    legacy.name !== "sohojac-dev" ||
    legacyId === sharedD1.id
  )
    throw Error("Legacy database identity mismatch; no deletion allowed.");
  // Both actual deployed Workers must already reference the one shared DB.
  for (const worker of ["sohojac", "sohojac-dev"]) {
    const settings = await api(`/workers/scripts/${worker}/settings`);
    const binding = settings?.bindings?.find(
      (item) => item.name === "DB" && item.type === "d1",
    );
    if ((binding?.id ?? binding?.database_id) !== sharedD1.id)
      throw Error(
        `Worker ${worker} has not switched to shared D1; legacy database retained.`,
      );
  }
  const recovery = await api(`/d1/database/${legacyId}/time_travel/bookmark`);
  if (typeof recovery?.bookmark !== "string" || !recovery.bookmark)
    throw Error("Legacy recovery bookmark unavailable; database retained.");
  fs.writeFileSync(
    path.join(process.env.RUNNER_TEMP, "retired-dev-d1-recovery.json"),
    JSON.stringify(
      {
        databaseId: legacyId,
        name: legacy.name,
        bookmark: recovery.bookmark,
        capturedAt: new Date().toISOString(),
        commit: process.env.GITHUB_SHA,
        note: "Cloudflare database undelete is required before using this former database bookmark; shared sohojac was not reset.",
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  await api(`/d1/database/${legacyId}`, "DELETE");
  console.log(
    "Retired the exact former sohojac-dev D1 after both deployed Workers confirmed shared sohojac. Shared data and credentials were preserved.",
  );
} else
  console.log(
    "Former sohojac-dev D1 is already absent; shared sohojac is the only project database.",
  );
