import { verifyTurnstile } from "@/lib/security/request-protection";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { isStaffOrigin } from "@/lib/auth";

export const dynamic = "force-dynamic";
const requestSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  email: z.email().max(254).transform(s => s.toLowerCase()),
  mobile: z.string().trim().regex(/^01[3-9][0-9]{8}$/),
  requestedRole: z.enum(["ADMIN", "OPERATOR", "TEACHER"]),
  purpose: z.string().trim().min(5).max(500),
  consent: z.literal(true),
  website: z.string().max(120).default(""),
  turnstileToken: z.string().max(2048).default(""),
}).strict();

const json = (data: object, status = 200) => Response.json(data, {
  status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
});
const accepted = () => json({
  ok: true,
  message: "If the request is eligible, the academy will review it and contact you. An account has not been created.",
}, 202);

export async function POST(request: Request) {
  if (!isStaffOrigin(request.url)) return json({ error: "Not found" }, 404);
  const origin = new URL(request.url).origin;
  if (request.headers.get("origin") !== origin ||
      request.headers.get("sec-fetch-site") === "cross-site") {
    return json({ error: "Request origin not accepted" }, 403);
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return json({ error: "JSON required" }, 415);
  }
  let payload: unknown;
  try {
    const body = await request.text();
    if (body.length > 5000) return json({ error: "Request too large" }, 413);
    payload = JSON.parse(body);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) return json({ error: "Please review all fields." }, 400);
  const data = parsed.data;
  if (data.website) return accepted(); // Honeypot.

  const securityError = await verifyTurnstile(request, data.turnstileToken, "staff-access-request");
  if (securityError) return securityError;
  try {
    // Public requests only create PENDING review rows; never staff logins.
    // The partial unique index prevents duplicate active requests per email.
    const requestId = crypto.randomUUID();
    await env.DB.prepare(`INSERT OR IGNORE INTO staff_access_requests
      (id,full_name,email,mobile,requested_role,purpose,status)
      VALUES (?,?,?,?,?,?,'PENDING')`).bind(
        requestId, data.fullName, data.email, data.mobile,
        data.requestedRole, data.purpose
      ).run();
    return accepted(); // Avoid revealing existing staff or pending requests.
  } catch {
    return json({ error: "Request service is temporarily unavailable" }, 503);
  }
}
