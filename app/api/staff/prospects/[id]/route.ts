import { env } from "cloudflare:workers";
import { z } from "zod";
import { canManageProspects, getStaffAccess, privateJson, sameOrigin } from "@/lib/staff-access";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  status: z.enum(["NEW", "CONTACTED", "CLOSED"]),
  note: z.string().trim().max(1000).default(""),
}).strict();

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Context) {
  const staff = await getStaffAccess(request.url, request.headers);
  if (!staff) return privateJson({ error: "Authentication required" }, 401);
  if (!canManageProspects(staff)) return privateJson({ error: "Access denied" }, 403);
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return privateJson({ error: "Invalid ID" }, 400);
  try {
    const result = await env.DB.prepare(
      "SELECT from_status, to_status, note, occurred_at FROM staff_prospect_events WHERE enquiry_id = ? ORDER BY occurred_at DESC LIMIT 30"
    ).bind(id).all();
    return privateJson({ events: result.results ?? [] });
  } catch {
    return privateJson({ error: "History unavailable" }, 503);
  }
}

export async function PATCH(request: Request, ctx: Context) {
  const staff = await getStaffAccess(request.url, request.headers);
  if (!staff) return privateJson({ error: "Authentication required" }, 401);
  if (!canManageProspects(staff)) return privateJson({ error: "Access denied" }, 403);
  if (!sameOrigin(request)) return privateJson({ error: "Invalid request origin" }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return privateJson({ error: "JSON required" }, 415);
  }
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return privateJson({ error: "Invalid ID" }, 400);
  let payload: unknown;
  try {
    const body = await request.text();
    if (body.length > 3000) return privateJson({ error: "Request too large" }, 413);
    payload = JSON.parse(body);
  } catch {
    return privateJson({ error: "Invalid JSON" }, 400);
  }
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) return privateJson({ error: "Invalid status or note" }, 400);
  try {
    const current = await env.DB.prepare(
      "SELECT status FROM public_enquiries WHERE id = ?"
    ).bind(id).first<{status: string}>();
    if (!current) return privateJson({ error: "Prospect not found" }, 404);
    if (current.status === parsed.data.status && !parsed.data.note) {
      return privateJson({ error: "Nothing to update" }, 400);
    }
    // D1 batch executes atomically. changes() in the next statement ensures
    // a stale/concurrent status update cannot create a false audit event.
    const outcome = await env.DB.batch([
      env.DB.prepare("UPDATE public_enquiries SET status = ? WHERE id = ? AND status = ?")
        .bind(parsed.data.status, id, current.status),
      env.DB.prepare(
        `INSERT INTO staff_prospect_events
        (id, enquiry_id, actor_user_id, from_status, to_status, note)
        SELECT ?, ?, ?, ?, ?, ? WHERE changes() = 1`
      ).bind(crypto.randomUUID(), id, staff.userId, current.status,
        parsed.data.status, parsed.data.note),
    ]);
    if (outcome[0].meta.changes !== 1 || outcome[1].meta.changes !== 1) {
      return privateJson({ error: "This prospect changed. Refresh and retry." }, 409);
    }
    return privateJson({ ok: true, status: parsed.data.status });
  } catch {
    return privateJson({ error: "Could not update prospect" }, 503);
  }
}
