import { env } from "cloudflare:workers";
import type { StaffAccess } from "@/lib/staff-access";
import { erpRouteRegistry } from "@/modules/platform/navigation/erp-route-registry";

const ownerCommands = [
  "system.master_data.manage",
  "academics.manage",
  "finance.billing.manage",
  "finance.payments.post",
  "admissions.manage",
  "admissions.create",
  "students.manage",
  "staff.manage",
  "workforce.manage",
  "audit.view",
  "communications.manage",
  "system.users.manage",
  "system.settings.manage",
  "crm.prospects.manage",
  "crm.followups.manage",
  "accounting.expenses.post"
] as const;

/** Called only after verified active staff authentication; grants are read fresh. */
export async function loadStaffPermissions(staff: Pick<StaffAccess, "userId" | "role">): Promise<string[]> {
  const result = await env.DB.prepare(
    "SELECT permission FROM erp_permission_grants WHERE user_id = ? ORDER BY permission",
  ).bind(staff.userId).all<{ permission: string }>();
  return [...new Set([
    ...(result.results ?? []).map(row => row.permission),
    ...(staff.role === "OWNER" ? [
      ...erpRouteRegistry.map(route => route.permission), ...ownerCommands,
    ] : []),
    "dashboard.view",
  ])];
}
