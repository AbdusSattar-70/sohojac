import { getStaffAccess, privateJson, sameOrigin } from "@/lib/staff-access";

/**
 * Old admission writes predate physical consent, reviewed fees and paid
 * activation. Keep their URLs fail-closed so cached clients cannot bypass the
 * canonical dashboard lifecycle. Historical records remain readable.
 */
export async function retiredAdmissionMutation(request: Request, id?: string) {
  const staff = await getStaffAccess(request.url, request.headers);
  if (!staff) return privateJson({ error: "Authentication required" }, 401);
  if (!["OWNER", "ADMIN", "OPERATOR"].includes(staff.role)) {
    return privateJson({ error: "Access denied" }, 403);
  }
  if (!sameOrigin(request)) {
    return privateJson({ error: "Invalid request origin" }, 403);
  }
  if (id !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return privateJson({ error: "Invalid application ID" }, 400);
  }
  return privateJson({
    error: "This admission endpoint has been retired. Use the admission workspace to verify consent, fees, payment and enrollment.",
    code: "LEGACY_ADMISSION_MUTATION_RETIRED",
    workspace: id ? `/dashboard/admissions/${id}` : "/dashboard/admissions",
  }, 410);
}
