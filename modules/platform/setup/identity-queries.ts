import { env } from "cloudflare:workers";
import { requirePermission } from "../auth/erp-context";

export async function getAcademyIdentity() {
  await requirePermission("system.settings.manage");
  const [identity, branch] = await Promise.all([
    env.DB.prepare("SELECT name FROM academy_identity WHERE id='academy'").first<{name:string}>(),
    env.DB.prepare("SELECT name FROM academy_branches WHERE code='MAIN'").first<{name:string}>(),
  ]);
  return { name: identity?.name ?? "", branchName: branch?.name ?? "" };
}
