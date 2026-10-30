import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { loadStaffPermissions } from "./staff-permissions";
import { getStaffAccessForPage } from "@/lib/staff-access";
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
    const permissions = await loadStaffPermissions(staff);
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
