import { env } from "cloudflare:workers";
import { requirePermission } from "@/modules/platform/auth/erp-context";
import type { PaperCatalogue } from "./components/admission-paper";

/** Current D1 academic registers; print-only, never creates admissions. */
export async function getPrintCatalogue(): Promise<PaperCatalogue> {
  await requirePermission("admissions.create");
  const [offerings, subjects] = await Promise.all([
    env.DB.prepare("SELECT id,name FROM public_programme_offerings WHERE is_active=1 ORDER BY name,id LIMIT 300").all<{id:string;name:string}>(),
    env.DB.prepare("SELECT id,title AS name FROM academic_subjects WHERE active=1 ORDER BY title,id LIMIT 300").all<{id:string;name:string}>(),
  ]);
  return {offerings:offerings.results??[],subjects:subjects.results??[]};
}
