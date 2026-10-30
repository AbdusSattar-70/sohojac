import { seedPublicCatalogue } from "./public-catalogue-seed.mjs";
import { sharedD1 } from "../lib/database-target.ts";
const {
  CLOUDFLARE_ACCOUNT_ID: account,
  CLOUDFLARE_API_TOKEN: token,
  GITHUB_REF: ref,
} = process.env;
if (
  !account ||
  !token ||
  !["refs/heads/dev", "refs/heads/master"].includes(ref)
)
  throw Error("Catalogue seed requires an authorized shared D1 release.");
async function query(sql) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${sharedD1.id}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params: [] }),
    },
  );
  const data = await response.json();
  if (
    !response.ok ||
    data.success !== true ||
    !Array.isArray(data.result) ||
    data.result.some((x) => x.success !== true)
  )
    throw Error(
      "Public catalogue seed failed; existing credentials were not changed. Inspect D1 constraints before retrying.",
    );
  return data.result;
}
const result = await seedPublicCatalogue(query);
console.log(
  result.applied
    ? "Verified three public Boys Evening Care offerings, current fee plans and 12-seat batches. No students, admissions or payments created."
    : "Public catalogue seed already complete; preserving operator changes.",
);
