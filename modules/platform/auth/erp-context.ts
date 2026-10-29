import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "cloudflare:workers";
import { getStaffAccessForPage } from "@/lib/staff-access";
import { erpRouteRegistry } from "@/modules/platform/navigation/erp-route-registry";
import type { ErpContext } from "@/types/erp";

/**
 * D1/Better Auth replacement for source modules/platform/auth/erp-context.ts.
 * Authentication is independently verified against active staff membership,
 * not supplied by the browser. Missing tables or grant failures deny access.
 */
export const getErpContext = cache(async (): Promise<ErpContext | null> => {
  const staff = await getStaffAccessForPage(await headers());
  if (!staff) return null;
  try {
    const results = await env.DB.prepare(
      "SELECT permission FROM erp_permission_grants WHERE user_id = ? ORDER BY permission"
    ).bind(staff.userId).all<{ permission: string }>();
    const grants = (results.results ?? []).map(row => row.permission);
    // Only the sole verified OWNER may have comprehensive ERP access
    // without explicit grants. All other roles require named user grants.
    const ownerRoutes = staff.role === "OWNER"
      ? erpRouteRegistry.map(route => route.permission) : [];
    const permissions = Array.from(new Set([...grants, ...ownerRoutes,
      ...(staff.role === "OWNER" ? [
        "system.master_data.manage", "academics.manage",
        "finance.billing.manage", "finance.payments.post", "admissions.manage", "admissions.create", "students.manage",
        "staff.manage", "workforce.manage", "audit.view",
        "system.users.manage",
        "crm.prospects.manage", "crm.followups.manage",
      ] : []),
      // A verified staff member can enter the root to see a safe, empty
      // workspace, but cannot infer access to restricted modules.
      "dashboard.view",
    ]));
    return {
      profileId: staff.userId,
      displayName: staff.name,
      email: staff.email,
      status: "ACTIVE",
      staffId: staff.staffId,
      staffNo: staff.staffNo,
      staffName: null,
      roles: [staff.role, ...(staff.role === "OWNER" ? ["ADMIN"] : [])],
      permissions,
    };
  } catch {
    return null;
  }
});

export async function requireErpContext(): Promise<ErpContext> {
  const context = await getErpContext();
  if (!context) redirect("/sign-in");
  return context;
}

export async function requirePermission(permission: string): Promise<ErpContext> {
  const context = await requireErpContext();
  if (!context.permissions.includes(permission)) redirect("/dashboard?access=denied");
  return context;
}
