import { env } from "cloudflare:workers";
import { hashPassword } from "better-auth/crypto";
import { isStaffOrigin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
const respond = (error: string, status: number) =>
  Response.json({ error }, { status, headers });

/**
 * Restricted first-owner initialization. Nothing is enabled by deployment
 * alone: the database administrator must issue a 256-bit, 30-minute ticket in
 * the Cloudflare D1 Console. There is never any anonymous staff signup.
 */
export async function POST(request: Request) {
  if (!isStaffOrigin(request.url)) return respond("Not found", 404);
  const origin = new URL(request.url).origin;
  if (request.headers.get("origin") !== origin ||
      request.headers.get("sec-fetch-site") === "cross-site") {
    return respond("Forbidden", 403);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return respond("JSON required", 415);
  }

  let payload: unknown;
  try {
    const body = await request.text();
    if (body.length > 1024) return respond("Request too large", 413);
    payload = JSON.parse(body);
  } catch {
    return respond("Invalid request", 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return respond("Invalid request", 400);
  }
  const data = payload as Record<string, unknown>;
  if (Object.keys(data).sort().join(",") !== "password,token" ||
      typeof data.token !== "string" || !/^[0-9a-f]{64}$/.test(data.token) ||
      typeof data.password !== "string" ||
      data.password.length < 8 || data.password.length > 128) {
    return respond("Enter the 64-character setup code and a password of 8–128 characters", 400);
  }

  try {
    // Fast negative check before CPU-intensive password hashing. The batch
    // repeats the same conditions atomically to prevent a creation race.
    const ticket = await env.DB.prepare(
      `SELECT id FROM staff_owner_setup
       WHERE id = 'first-owner' AND token = ? AND consumed_at IS NULL
         AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
         AND NOT EXISTS(SELECT 1 FROM "user")
         AND NOT EXISTS(SELECT 1 FROM staff_memberships)`
    ).bind(data.token).first();
    if (!ticket) return respond("Setup code unavailable or expired", 403);

    const passwordHash = await hashPassword(data.password);
    const userId = crypto.randomUUID();
    const accountId = crypto.randomUUID();
    const claimId = crypto.randomUUID();
    const consumedAt = new Date().toISOString();
    const timestamp = Date.now();

    // D1 batch is transactional. A staff-directory trigger may add another\n    // affected row to membership write metadata; require each direct write\n    // to affect >=1 row, and verify active owner afterwards.\n    // D1 batch is transactional: consume the one-time code and create the
    // Better Auth credential + active OWNER together, or not at all.
    const results = await env.DB.batch([
      env.DB.prepare(`UPDATE staff_owner_setup SET consumed_at=?, claim_id=?
        WHERE id='first-owner' AND token=? AND consumed_at IS NULL
          AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
          AND NOT EXISTS(SELECT 1 FROM "user")
          AND NOT EXISTS(SELECT 1 FROM staff_memberships)`)
        .bind(consumedAt, claimId, data.token),
      env.DB.prepare(`INSERT INTO "user"
        ("id","name","email","emailVerified","createdAt","updatedAt")
        SELECT ?,display_name,email,1,?,? FROM staff_owner_setup
        WHERE id='first-owner' AND claim_id=? AND consumed_at=?`)
        .bind(userId, timestamp, timestamp, claimId, consumedAt),
      env.DB.prepare(`INSERT INTO "account"
        ("id","accountId","providerId","userId","password","createdAt","updatedAt")
        SELECT ?,?,'credential',?,?,?,? FROM staff_owner_setup
        WHERE id='first-owner' AND claim_id=? AND consumed_at=?`)
        .bind(accountId, userId, userId, passwordHash, timestamp, timestamp, claimId, consumedAt),
      env.DB.prepare(`INSERT INTO staff_memberships (user_id,role,active)
        SELECT ?,'OWNER',1 FROM staff_owner_setup
        WHERE id='first-owner' AND claim_id=? AND consumed_at=?`)
        .bind(userId, claimId, consumedAt),
    ]);
    if (results.length !== 4 || results.some(result => (result.meta?.changes ?? 0) < 1)) {
      return respond("Owner setup was not completed. Contact the database administrator", 503);
    }

    return Response.json({ ok: true }, { status: 201, headers });
  } catch {
    // No SQL, password or hash in logs/responses.
    return respond("Owner setup unavailable. Check D1 setup status", 503);
  }
}
