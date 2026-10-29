import { env } from "cloudflare:workers";
import { getStaffAccess, privateJson } from "@/lib/staff-access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const staff = await getStaffAccess(request.url, request.headers);
  if (!staff) return privateJson({error:"Authentication required"}, 401);
  if (staff.role !== "OWNER" && staff.role !== "ADMIN") return privateJson({error:"Access denied"}, 403);
  const status = new URL(request.url).searchParams.get("status") || "PENDING";
  if (!["PENDING","VERIFIED","INVITED","ACTIVE","DECLINED","ALL"].includes(status)) {
    return privateJson({error:"Invalid filter"},400);
  }
  try {
    const items = await env.DB.prepare(`SELECT r.id,r.full_name,r.email,r.mobile,r.requested_role,
      r.assigned_role,r.purpose,r.status,r.review_note,r.created_at,r.reviewed_at,
      COALESCE(u.name,'') AS reviewed_by_name
      FROM staff_access_requests r LEFT JOIN "user" u ON u.id=r.reviewed_by
      WHERE (?='ALL' OR r.status=?) ORDER BY r.created_at DESC, r.id DESC LIMIT 100`)
      .bind(status,status).all();
    return privateJson({items:items.results ?? []});
  } catch {
    return privateJson({error:"Access request service unavailable"},503);
  }
}
