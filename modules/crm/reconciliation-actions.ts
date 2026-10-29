"use server";

import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getErpContext } from "@/modules/platform/auth/erp-context";

// The previous website only knew NEW / CONTACTED / CLOSED. Never infer that
// CLOSED means lost or converted. A staff member must classify it with evidence.
const reconcileSchema = z.object({
  prospectId: z.string().uuid(),
  newStatus: z.enum(["NEW", "CONTACTED", "LOST"]),
  reason: z.string().trim().min(12).max(500),
}).strict();

export async function reconcileLegacyProspect(input: unknown) {
  const parsed = reconcileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Choose a status and explain the historical evidence (at least 12 characters)." };
  }
  const context = await getErpContext();
  if (!context?.permissions.includes("crm.prospects.manage")) {
    return { ok: false, message: "You cannot reconcile historical prospects." };
  }
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  const host = requestHeaders.get("host");
  if (!origin || !host) return { ok: false, message: "Invalid request origin." };
  try {
    if (new URL(origin).host.toLowerCase() !== host.toLowerCase()) {
      return { ok: false, message: "Invalid request origin." };
    }
  } catch {
    return { ok: false, message: "Invalid request origin." };
  }

  const { prospectId, newStatus, reason } = parsed.data;
  try {
    const existing = await env.DB.prepare(
      "SELECT p.id,p.status,p.version,p.lost_reason,e.status AS public_status " +
      "FROM academy_prospects p JOIN public_enquiries e ON e.id=p.id WHERE p.id=?"
    ).bind(prospectId).first<{
      id: string; status: string; version: number;
      lost_reason: string | null; public_status: string;
    }>();
    if (!existing || existing.status !== "LEGACY_CLOSED" || existing.public_status !== "CLOSED") {
      return { ok: false, message: "Historical status changed or is not eligible. Refresh the prospect." };
    }
    const auditId = crypto.randomUUID();
    const publicStatus = newStatus === "LOST" ? "CLOSED" : newStatus;
    const batch = await env.DB.batch([
      env.DB.prepare(
        "UPDATE academy_prospects SET status=?,lost_reason=?,version=version+1," +
        "updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND " +
        "status='LEGACY_CLOSED' AND version=? AND " +
        "EXISTS(SELECT 1 FROM public_enquiries e WHERE e.id=? AND e.status='CLOSED')"
      ).bind(newStatus,newStatus === "LOST" ? reason : null,prospectId,existing.version,prospectId),
      env.DB.prepare(
        "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,before_json,after_json) " +
        "SELECT ?,'prospect',?,'LEGACY_STATUS_RECONCILED',?,?,?,? WHERE changes()=1"
      ).bind(auditId,prospectId,context.profileId,reason,JSON.stringify(existing),
        JSON.stringify({ status: newStatus, publicStatus, evidence: reason })),
      env.DB.prepare(
        "UPDATE public_enquiries SET status=? WHERE id=? AND status='CLOSED' " +
        "AND EXISTS(SELECT 1 FROM erp_audit_events WHERE id=? AND action='LEGACY_STATUS_RECONCILED')"
      ).bind(publicStatus,prospectId,auditId),
    ]);
    if (batch.length !== 3 || batch.some(result => result.meta?.changes !== 1)) {
      return { ok: false, message: "The prospect changed. Refresh before reconciling." };
    }
    revalidatePath("/dashboard/crm/prospects");
    revalidatePath("/dashboard/crm/prospects/" + prospectId);
    revalidatePath("/dashboard/governance/audit");
    return { ok: true, message: "Historical classification recorded with an audit trail." };
  } catch {
    return { ok: false, message: "Reconciliation could not be saved. Refresh and retry." };
  }
}
