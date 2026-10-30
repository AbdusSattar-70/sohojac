import { getStaffAccess } from "@/lib/staff-access";
import { loadStaffPermissions } from "./staff-permissions";

export type CommandActor = { profileId: string; permissions: readonly string[] };

/** REST and Server Actions use the same verified membership and named grants.
 * Actor IDs and permissions are never taken from JSON input.
 */
export async function getCommandAccess(request: Request): Promise<CommandActor | null> {
  const staff = await getStaffAccess(request.url, request.headers);
  if (!staff) return null;
  return { profileId: staff.userId, permissions: await loadStaffPermissions(staff) };
}
