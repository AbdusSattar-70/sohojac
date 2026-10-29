import { env } from "cloudflare:workers";
import { getStaffAccess, canManageProspects, privateJson } from "@/lib/staff-access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const staff = await getStaffAccess(request.url, request.headers);
  if (!staff) return privateJson({ error: "Authentication required" }, 401);
  if (!canManageProspects(staff)) return privateJson({ error: "Access denied" }, 403);

  const params = new URL(request.url).searchParams;
  const status = params.get("status") ?? "ALL";
  const pageInput = params.get("page") ?? "1";
  const query = (params.get("q") ?? "").trim();
  if (!["ALL", "NEW", "CONTACTED", "CLOSED"].includes(status) ||
      !/^[1-9][0-9]{0,2}$/.test(pageInput) ||
      query.length > 80) return privateJson({ error: "Invalid filter" }, 400);

  const page = Number(pageInput);
  const search = query ? "%" + query.replace(/[\\%_]/g, "\\$&") + "%" : "";
  const statusFilter = status === "ALL" ? "" : " AND e.status = ?";
  const queryFilter = search ? " AND (e.reference LIKE ? ESCAPE '\\' OR e.student_name LIKE ? ESCAPE '\\' OR e.mobile LIKE ? ESCAPE '\\')" : "";
  const args = [...(status === "ALL" ? [] : [status]), ...(search ? [search, search, search] : [])];

  try {
    const list = await env.DB.prepare(
      `SELECT e.id, e.reference, e.intent, e.student_name, e.class_name,
        e.school_name, e.guardian_name, e.mobile, e.area, e.status, e.submitted_at,
        o.name AS programme
       FROM public_enquiries e
       LEFT JOIN public_programme_offerings o ON o.id = e.offering_id
       WHERE 1=1${statusFilter}${queryFilter}
       ORDER BY e.submitted_at DESC, e.id DESC LIMIT 25 OFFSET ?`
    ).bind(...args, (page - 1) * 25).all();
    const totals = await env.DB.prepare(
      "SELECT status, COUNT(*) AS count FROM public_enquiries GROUP BY status"
    ).all<{ status: string; count: number }>();
    return privateJson({ items: list.results ?? [], page,
      hasMore: (list.results?.length ?? 0) === 25,
      totals: totals.results ?? [] });
  } catch {
    return privateJson({ error: "Prospect service unavailable" }, 503);
  }
}
