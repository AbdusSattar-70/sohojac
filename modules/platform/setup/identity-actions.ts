"use server";
import { z } from "zod";
import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getErpContext } from "../auth/erp-context";

export async function saveAcademyIdentity(input: unknown) {
  const context = await getErpContext();
  if (!context?.permissions.includes("system.settings.manage"))
    return { ok: false, message: "Academy setup permission required." };
  const h = await headers();
  try {
    if (!h.get("origin") || new URL(h.get("origin")!).host.toLowerCase() !== h.get("host")?.toLowerCase())
      return { ok: false, message: "Invalid request origin." };
  } catch { return { ok: false, message: "Invalid request origin." }; }
  const parsed = z.object({
    name: z.string().trim().min(2).max(160),
    branch_name: z.string().trim().min(2).max(160),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Enter academy and campus names." };
  try {
    const { name, branch_name } = parsed.data;
    await env.DB.batch([
      env.DB.prepare("INSERT INTO academy_identity(id,name,confirmed_by) VALUES ('academy',?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,confirmed_by=excluded.confirmed_by,confirmed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')")
        .bind(name, context.profileId),
      env.DB.prepare("INSERT INTO academy_branches(id,code,name) VALUES (?,'MAIN',?) ON CONFLICT(code) DO UPDATE SET name=excluded.name,is_active=1")
        .bind(crypto.randomUUID(), branch_name),
      env.DB.prepare("UPDATE public_programme_offerings SET branch_name=?,version=version+1 WHERE branch_id=(SELECT id FROM academy_branches WHERE code='MAIN') AND branch_name IS NOT ?")
        .bind(branch_name, branch_name),
      env.DB.prepare("INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,after_json) VALUES (?,'academy_identity','academy','CONFIRMED',?,'Staff confirmed academy and main campus identity',?)")
        .bind(crypto.randomUUID(), context.profileId, JSON.stringify(parsed.data)),
    ]);
  } catch { return { ok: false, message: "Identity not saved. Refresh and try again." }; }
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Academy identity confirmed. Continue with the academic directory." };
}
