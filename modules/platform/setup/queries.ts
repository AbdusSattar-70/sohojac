/** Compatibility adapter for the original print forms. */
import { cache } from "react";
import { env } from "cloudflare:workers";
export const getAcademySetup = cache(async () => {
  const identity = await env.DB.prepare(
    "SELECT name FROM academy_identity WHERE id='academy'",
  ).first<{ name: string }>();
  return { academyName: identity?.name ?? "Sohoj Academy" };
});
