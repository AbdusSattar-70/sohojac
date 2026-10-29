import { env } from "cloudflare:workers";
import { createAuth, isStaffOrigin } from "@/lib/auth";

export type StaffRole = "OWNER" | "ADMIN" | "OPERATOR" | "TEACHER";
export type StaffAccess = {
  userId: string; name: string; email: string; role: StaffRole;
};

/** Re-validate the session and membership in D1 for EVERY private request. */
export async function getStaffAccess(requestUrl: string, headers: Headers): Promise<StaffAccess | null> {
  if (!isStaffOrigin(requestUrl)) return null;
  try {
    const session = await createAuth().api.getSession({ headers });
    if (!session?.user?.id || !session.user.emailVerified) return null;
    const member = await env.DB.prepare(
      "SELECT role FROM staff_memberships WHERE user_id = ? AND active = 1"
    ).bind(session.user.id).first<{ role: StaffRole }>();
    if (!member || !["OWNER", "ADMIN", "OPERATOR", "TEACHER"].includes(member.role)) return null;
    return { userId: session.user.id, name: session.user.name, email: session.user.email, role: member.role };
  } catch {
    // Database/configuration/auth errors must never turn into access grants.
    return null;
  }
}

/** Server pages have no Request URL. Compare the actual hostname strictly,
 * then use the configured origin (not untrusted x-forwarded-proto headers).
 */
export async function getStaffAccessForPage(headers: Headers): Promise<StaffAccess | null> {
  try {
    const configUrl = (env as typeof env & { BETTER_AUTH_URL?: string }).BETTER_AUTH_URL;
    if (!configUrl) return null;
    const origin = new URL(configUrl);
    if (headers.get("host")?.toLowerCase() !== origin.host.toLowerCase()) return null;
    return getStaffAccess(origin.origin + "/app", headers);
  } catch {
    return null;
  }
}

export function canManageProspects(staff: StaffAccess) {
  return staff.role === "OWNER" || staff.role === "ADMIN" || staff.role === "OPERATOR";
}

export function privateJson(body: object, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !!origin && origin === new URL(request.url).origin &&
    request.headers.get("sec-fetch-site") !== "cross-site";
}
