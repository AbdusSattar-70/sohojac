import { env } from "cloudflare:workers";
import type { PublicOfferingCard } from "./types";

type RawOffering = {
  id: string; code: string; name: string; class_name: string; academic_year_name: string;
  branch_name: string; group_name: string | null;
  showcase_title: string | null; showcase_title_bn: string | null;
  showcase_description: string | null; showcase_description_bn: string | null;
  showcase_eyebrow: string | null; showcase_eyebrow_bn: string | null;
  showcase_icon: string | null;
  public_schedule: string | null; public_schedule_bn: string | null;
  public_requirements: string | null; public_requirements_bn: string | null;
  admission_policy: string | null; admission_policy_bn: string | null;
  active_batch_count: number; current_open_seats: number; current_total_seats: number;
  is_accepting_applications: number; application_state: "OPEN" | "UPCOMING" | "CLOSED";
  applications_open_on: string | null; applications_close_on: string | null;
  subjects_json: string; fee_plan_json: string | null;
};

function decode<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try { return JSON.parse(json) as T; } catch { return fallback; }
}

/** Only ACTIVE, website-published offerings. No Supabase dependency. */
export async function getPublicProgrammeOfferings(): Promise<PublicOfferingCard[] | null> {
  try {
    const result = await env.DB.prepare(
      "SELECT * FROM public_programme_offerings WHERE show_on_website = 1 AND is_active = 1 ORDER BY showcase_sort_order, created_at DESC LIMIT 48"
    ).all<RawOffering>();
    return (result.results ?? []).map(row => ({
      ...row,
      is_accepting_applications: Boolean(row.is_accepting_applications && row.application_state === "OPEN"),
      subjects: decode<{ id: string; code: string; name: string }[]>(row.subjects_json, []),
      fee_plan: decode<PublicOfferingCard["fee_plan"]>(row.fee_plan_json, null),
    }));
  } catch {
    // Don't claim that nothing is published when the database is unavailable.
    return null;
  }
}
