import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { getErpContext } from "@/modules/platform/auth/erp-context";

/** Named source permissions and the configured staff origin are rechecked for
 * every server action. Caller-supplied actor or organization IDs are not used.
 */
export async function studentCommandActor(permission: string, needsView = true) {
  const context = await getErpContext();
  if (!context?.permissions.includes(permission) ||
    (needsView && !context.permissions.includes("students.view"))) return null;
  const requestHeaders = await headers();
  const configured = (env as typeof env & { BETTER_AUTH_URL?: string }).BETTER_AUTH_URL;
  const origin = requestHeaders.get("origin");
  if (!configured || !origin || requestHeaders.get("sec-fetch-site") === "cross-site") return null;
  try {
    const staffOrigin = new URL(configured);
    if (origin !== staffOrigin.origin ||
      requestHeaders.get("host")?.toLowerCase() !== staffOrigin.host.toLowerCase()) return null;
  } catch { return null; }
  return context.profileId;
}
