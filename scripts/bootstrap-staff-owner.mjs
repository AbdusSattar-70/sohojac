/**
 * ONE-TIME owner provisioning from an operator's own terminal.
 * Do not store OWNER email/password in GitHub or pass password as a CLI argument.
 * Requires migrations/0003_better_auth_staff.sql already applied to remote D1.
 *
 * Better Auth credential passwords use its own scrypt hashing function.
 */
import { hashPassword } from "better-auth/crypto";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

const DB = "d6f3e4e9-2190-43bf-bc90-969687f6db78";
const email = (process.env.SOHOJAC_INITIAL_OWNER_EMAIL ?? "").trim().toLowerCase();
const password = process.env.SOHOJAC_INITIAL_OWNER_PASSWORD ?? "";
const name = (process.env.SOHOJAC_INITIAL_OWNER_NAME ?? "Sohojac Owner").trim();
const escapeSql = (str) => "'" + str.replaceAll("'", "''") + "'";
function runSql(sql) {
  try {
    const args = ["exec", "cf", "d1", "raw", DB, "--sql", sql];
    // CI uses local Miniflare D1 only; production workflow never sets this.
    if (process.env.SOHOJAC_D1_LOCAL === "1") args.push("--local", "--persist-to", ".cloudflare/state");
    return execFileSync("pnpm", args, {
      encoding: "utf8", timeout: 60000, maxBuffer: 2 * 1024 * 1024,
      // Avoid writing sensitive arguments or query contents to the job log.
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new Error("Remote D1 query failed; check tables and Cloudflare credentials without printing SQL or secrets.");
  }
}
function count(sql) {
  const results = JSON.parse(runSql(sql));
  if (!Array.isArray(results) || results[0]?.success !== true) {
    throw new Error("Cannot validate remote D1 schema or count.");
  }
  const number = results[0]?.results?.rows?.[0]?.[0];
  if (typeof number !== "number") throw new Error("Unexpected D1 query format.");
  return number;
}
// Owner creation is an intentional, interactive one-time database operation.
// Automatic deployments must NEVER create, replace, or reset staff credentials.
const existingOwners = count("SELECT COUNT(*) FROM staff_memberships WHERE role='OWNER' AND active=1");
if (existingOwners > 0) {
  throw new Error("An active OWNER already exists in D1. Nothing was changed.");
}
const current = count('SELECT (SELECT COUNT(*) FROM "user") + (SELECT COUNT(*) FROM staff_memberships)');
if (current !== 0) {
  throw new Error("Refusing bootstrap: existing auth records without a valid active OWNER. Review D1 manually, do not reset accounts.");
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    password.length < 16 || password.length > 128 ||
    name.length < 2 || name.length > 100) {
  throw new Error("Enter a valid owner email, name and unique 16–128 character password in the interactive local setup.");
}

const id = randomUUID();
const accountId = randomUUID();
const now = Date.now();
const hashedPassword = await hashPassword(password);
if (!hashedPassword || typeof hashedPassword !== "string") throw new Error("Password hashing failed.");

// The unique owner index allows at most one active OWNER. No user-supplied SQL
// goes through to D1 without strict escaping. Only random IDs are trusted.
// D1 raw calls are separate; on a mid-script failure, stop and inspect for a
// partial user/account record before any retry.
runSql(`INSERT INTO "user" ("id","name","email","emailVerified","createdAt","updatedAt")
 VALUES (${escapeSql(id)},${escapeSql(name)},${escapeSql(email)},1,${now},${now})`);
runSql(`INSERT INTO "account" ("id","accountId","providerId","userId","password","createdAt","updatedAt")
 VALUES (${escapeSql(accountId)},${escapeSql(id)},'credential',${escapeSql(id)},${escapeSql(hashedPassword)},${now},${now})`);
runSql(`INSERT INTO staff_memberships (user_id,role,active)
 VALUES (${escapeSql(id)},'OWNER',1)`);

if (count("SELECT COUNT(*) FROM staff_memberships WHERE role='OWNER' AND active=1") !== 1) {
  throw new Error("Owner verification failed; inspect D1 immediately.");
}
console.log("First staff OWNER created and verified in D1. Credentials were not saved to GitHub. Sign in on the configured staff domain.");
