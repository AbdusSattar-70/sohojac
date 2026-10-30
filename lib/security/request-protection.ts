import { env } from "cloudflare:workers";

type Bindings = typeof env & { TURNSTILE_SECRET_KEY?: string; TURNSTILE_SITE_KEY?: string; BETTER_AUTH_URL?: string };
export type ProtectionPolicy = { scope: string; limit: number; seconds: number; action?: string };
const authActions: Record<string, string> = {
  "/api/auth/sign-in/email": "staff-sign-in",
  "/api/auth/request-password-reset": "staff-password-recovery",
  "/api/auth/reset-password": "staff-password-reset",
  "/api/setup-owner": "staff-owner-setup",
  "/api/staff/accept-invitation": "staff-invitation",
};

export function policyFor(request: Request): ProtectionPolicy | null {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return null;
  const path = decodeURIComponent(new URL(request.url).pathname).replace(/\/+/g, "/").replace(/\/+$/, "");
  if (authActions[path]) return {
    scope: path, limit: path.includes("request-password-reset") ? 3 : 10,
    seconds: path.includes("sign-in") ? 300 : 900, action: authActions[path],
  };
  if (path === "/api/enquiries" || path === "/api/staff/access-request")
    return { scope: "public-submissions", limit: 10, seconds: 60 };
  // Server Actions can be submitted to a different page URL; protect every
  // remaining mutation, not only the dashboard pathname or next-action header.
  return { scope: "erp-writes", limit: 240, seconds: 60 };
}

export function localSecurityRequest(request: Request): boolean {
  const local = (host: string) => ["localhost", "127.0.0.1", "[::1]"].includes(host);
  try {
    return local(new URL(request.url).hostname) && local(new URL((env as Bindings).BETTER_AUTH_URL ?? "").hostname);
  } catch { return false; }
}

export async function verifyTurnstile(request: Request, token: string, action: string): Promise<Response | null> {
  if (localSecurityRequest(request)) return null;
  const secret = (env as Bindings).TURNSTILE_SECRET_KEY;
  if (!secret) return securityResponse("Security verification is temporarily unavailable.", 503);
  if (!token || token.length > 2048) return securityResponse("Complete the security check and try again.", 403);
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token,
        ...(request.headers.get("cf-connecting-ip") ? { remoteip: request.headers.get("cf-connecting-ip")! } : {}),
      }),
    });
    if (!response.ok) return securityResponse("Security verification is temporarily unavailable.", 503);
    const result = await response.json() as { success?: boolean; hostname?: string; action?: string };
    if (!result.success || result.action !== action || result.hostname?.toLowerCase() !== new URL(request.url).hostname.toLowerCase())
      return securityResponse("Security check expired or failed. Please try again.", 403);
    return null;
  } catch { return securityResponse("Security verification is temporarily unavailable.", 503); }
}

export function securityResponse(error: string, status: number, retryAfter?: number): Response {
  return Response.json({ error, message: error }, { status, headers: {
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
  } });
}

export async function protectRequest(request: Request, now = Date.now()): Promise<Response | null> {
  let policy: ProtectionPolicy | null;
  try { policy = policyFor(request); } catch { return securityResponse("Invalid request path.", 400); }
  if (!policy) return null;
  // Local bypass needs BOTH the request hostname and configured auth origin.
  // No client header, CI flag or production environment variable disables protection.
  if (localSecurityRequest(request)) return null;
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site")
    return securityResponse("Request origin not accepted.", 403);
  const ip = request.headers.get("cf-connecting-ip");
  if (!ip) return securityResponse("Request verification is temporarily unavailable.", 503);
  const bucket = Math.floor(now / (policy.seconds * 1000));
  const expires = (bucket + 1) * policy.seconds;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${new URL(request.url).host}:${policy.scope}:${ip}:${bucket}`));
  const key = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  try {
    const result = await env.DB.batch([
      env.DB.prepare("DELETE FROM security_request_limits WHERE key IN (SELECT key FROM security_request_limits WHERE expires_at<? LIMIT 100)").bind(Math.floor(now / 1000)),
      env.DB.prepare("INSERT INTO security_request_limits(key,hits,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits").bind(key, expires),
    ]);
    const hits = (result[1].results?.[0] as { hits?: number } | undefined)?.hits;
    if (!Number.isInteger(hits)) return securityResponse("Request protection is temporarily unavailable.", 503);
    if (hits! > policy.limit) return securityResponse("Too many requests. Please wait before trying again.", 429, Math.max(1, Math.ceil(expires - now / 1000)));
  } catch { return securityResponse("Request protection is temporarily unavailable.", 503); }
  if (policy.action) return verifyTurnstile(request, request.headers.get("x-turnstile-token") ?? "", policy.action);
  return null;
}
