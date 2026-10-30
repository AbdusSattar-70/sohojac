import fs from "node:fs";
import { sharedD1 } from "../lib/database-target.ts";
const account = process.env.CLOUDFLARE_ACCOUNT_ID,
  token = process.env.CLOUDFLARE_API_TOKEN;
if (
  !account ||
  !token ||
  process.env.GITHUB_REF !== "refs/heads/dev" ||
  process.env.SOHOJAC_D1_ID !== sharedD1.id
)
  throw Error(
    "Development seed requires the authorized dev release and shared sohojac target.",
  );
const response = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${sharedD1.id}/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sql: fs.readFileSync(
        new URL("../seeds/development.sql", import.meta.url),
        "utf8",
      ),
      params: [],
    }),
  },
);
const result = await response.json().catch(() => null);
if (
  !response.ok ||
  result?.success !== true ||
  !Array.isArray(result.result) ||
  result.result.some((item) => item.success !== true)
)
  throw Error(
    `Development seed failed (HTTP ${response.status}); inspect the existing owner and shared D1 schema. No credentials were changed.`,
  );
console.log(
  "Idempotent TEST campus/programme/fee/batch/student/drafts/CRM seed applied; no reset, login or posted payment was created.",
);
