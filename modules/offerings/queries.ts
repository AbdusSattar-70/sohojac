import type {PublicOfferingCard} from "./types";
import {env} from "cloudflare:workers";
import {requirePermission} from "@/modules/platform/auth/erp-context";

/** Original WebsiteWorkspace/ PublicControlsForm presentation contract.
 * Canonical catalogue remains public_programme_offerings. No duplicate rows.
 */
export type WebsiteOfferingRow={
 id:string;code:string;name:string;status:"DRAFT"|"ACTIVE"|"RETIRED";
 is_website_visible:boolean;is_accepting_applications:boolean;
 showcase_title:string|null;showcase_title_bn:string|null;
 showcase_description:string|null;showcase_description_bn:string|null;
 showcase_eyebrow:string|null;showcase_eyebrow_bn:string|null;
 showcase_icon:string|null;showcase_sort_order:number;
 public_schedule:string|null;public_schedule_bn:string|null;
 public_requirements:string|null;public_requirements_bn:string|null;
 admission_policy:string|null;admission_policy_bn:string|null;
 applications_open_on:string|null;applications_close_on:string|null;
};
export type OfferingOverview={
 offerings:WebsiteOfferingRow[];
 subjects:Array<{id:string;code:string;name:string}>;
 offeringSubjects:Array<{offering_id:string;subject_id:string;sort_order:number}>;
};
type StoredOffering=Omit<WebsiteOfferingRow,"status"|"is_website_visible"|"is_accepting_applications"> & {
 is_active:number;show_on_website:number;is_accepting_applications:number;
};
export async function getWebsiteOfferings():Promise<OfferingOverview>{
 await requirePermission("academics.manage");
 const rows=await env.DB.prepare(
  "SELECT id,code,name,is_active,show_on_website,is_accepting_applications,"+
  "showcase_title,showcase_title_bn,showcase_description,showcase_description_bn,"+
  "showcase_eyebrow,showcase_eyebrow_bn,showcase_icon,showcase_sort_order,"+
  "public_schedule,public_schedule_bn,public_requirements,public_requirements_bn,"+
  "admission_policy,admission_policy_bn,applications_open_on,applications_close_on "+
  "FROM public_programme_offerings ORDER BY showcase_sort_order,code LIMIT 200"
 ).all<StoredOffering>();
 return {
  offerings:(rows.results??[]).map(row=>({
   ...row,status:row.is_active?"ACTIVE":"DRAFT",
   is_website_visible:Boolean(row.show_on_website),
   is_accepting_applications:Boolean(row.is_accepting_applications)
  })),
  // Website management never changes subject links. Source offering controls
  // support the subject selection in the separate original Academic module.
  subjects:[],offeringSubjects:[]
 };
}

// Existing public website contract retained without changes.
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
    return (result.results ?? []).map((row: RawOffering) => ({
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
