import { env } from "cloudflare:workers";
import { localSecurityRequest } from "@/lib/security/request-protection";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  const bindings = env as typeof env & {
    TURNSTILE_SITE_KEY?: string;
    TURNSTILE_SECRET_KEY?: string;
  };
  const required = !localSecurityRequest(request);
  const ready =
    !required ||
    Boolean(bindings.TURNSTILE_SITE_KEY && bindings.TURNSTILE_SECRET_KEY);
  return Response.json(
    {
      maintenanceGate: "foundation-reset-v1",
      required,
      ready,
      siteKey: bindings.TURNSTILE_SITE_KEY ?? "",
    },
    {
      status: ready ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
