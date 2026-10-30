import fs from "node:fs";
import path from "node:path";
import { sharedD1 } from "../lib/database-target.ts";
import { operationId, resetPlan } from "./foundation-reset-plan.mjs";
const {
  CLOUDFLARE_ACCOUNT_ID: account,
  CLOUDFLARE_API_TOKEN: token,
  RUNNER_TEMP: temp,
  GITHUB_SHA: commit,
} = process.env;
if (
  !account ||
  !token ||
  !temp ||
  process.env.GITHUB_REF !== "refs/heads/master"
)
  throw Error("Reset requires the authorized main release.");
const recovery = JSON.parse(
  fs.readFileSync(path.join(temp, "sohojac-d1-recovery.json"), "utf8"),
);
if (
  recovery.databaseId !== sharedD1.id ||
  recovery.commit !== commit ||
  !recovery.bookmark ||
  Date.now() - Date.parse(recovery.capturedAt) > 3600000
)
  throw Error("Fresh recovery checkpoint required.");
const base = `https://api.cloudflare.com/client/v4/accounts/${account}`;
async function api(url, body) {
  const response = await fetch(base + url, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (
    !response.ok ||
    data.success !== true ||
    (Array.isArray(data.result) && data.result.some((x) => x.success === false))
  )
    throw Error(
      `Cloudflare operation failed: HTTP ${response.status}. Recovery bookmark retained; retry the release after resolving the error.`,
    );
  return data.result;
}
const database = await api(`/d1/database/${sharedD1.id}`);
if (database.name !== sharedD1.name)
  throw Error("Canonical database identity mismatch.");
const query = async (sql, params = []) =>
  api(`/d1/database/${sharedD1.id}/query`, { sql, params });
const existing = (
  await query("SELECT * FROM system_maintenance_operations WHERE id=?", [
    operationId,
  ])
)[0].results[0];
if (existing?.status === "COMPLETE") {
  console.log(
    "Foundation reset already completed; preserving all subsequent work.",
  );
  process.exit(0);
}
const subdomain = (await api("/workers/subdomain")).subdomain;
for (const url of [
  "https://sohojac.com",
  `https://sohojac-dev.${subdomain}.workers.dev`,
]) {
  const response = await fetch(url + "/api/security/challenge");
  const data = await response.json();
  if (data.maintenanceGate !== "foundation-reset-v1")
    throw Error(
      "Both Workers must support maintenance before resetting shared D1. Deploy dev first.",
    );
}
const owner = (
  await query(
    "SELECT user_id FROM staff_memberships WHERE role='OWNER' AND active=1 LIMIT 1",
  )
)[0].results[0];
if (!owner)
  throw Error(
    "Existing administrator required; no credentials will be invented.",
  );
const schema = existing
  ? JSON.parse(existing.manifest_json)
  : (
      await query(
        "SELECT type,name,sql FROM sqlite_schema WHERE type IN ('table','trigger')",
      )
    )[0].results;
if (!existing)
  await query(
    "INSERT INTO system_maintenance_operations(id,status,manifest_json) VALUES (?,'PREPARED',?)",
    [operationId, JSON.stringify(schema)],
  );
// Allow requests admitted just before maintenance to finish. Both Workers now deny new writes.
await new Promise((resolve) => setTimeout(resolve, 15000));
await query(
  resetPlan(
    schema,
    fs.readFileSync(
      new URL("../seeds/foundation.sql", import.meta.url),
      "utf8",
    ),
  ),
);
const checks = (
  await query(
    "SELECT (SELECT count(*) FROM academy_classes) classes,(SELECT count(*) FROM academy_guardian_relationships) relationships,(SELECT count(*) FROM academy_students) students,(SELECT count(*) FROM finance_payments) payments,(SELECT status FROM system_maintenance_operations WHERE id=?) status",
    [operationId],
  )
)[0].results[0];
if (
  checks.classes !== 12 ||
  checks.relationships < 25 ||
  checks.students !== 0 ||
  checks.payments !== 0 ||
  checks.status !== "COMPLETE"
)
  throw Error("Post-reset validation failed; inspect the recovery checkpoint.");
console.log(
  "Shared sohojac reset complete: Classes 1–12, guardian relationships and reference masters seeded. Existing login credentials preserved. No sample people or financial postings.",
);
