import type {PublicOfferingCard} from "./types";
import {env} from "cloudflare:workers";
import {getErpContext,requirePermission} from "@/modules/platform/auth/erp-context";

export type WebsiteOfferingRow={
 id:string;code:string;name:string;status:"DRAFT"|"ACTIVE"|"RETIRED";version:number;
 branch_id:string|null;academic_year_id:string|null;class_id:string|null;program_id:string|null;group_id:string|null;
 operation_kind:"SCHOOL"|"COACHING"|"TRAINING"|null;teaching_starts_on:string|null;teaching_ends_on:string|null;
 class_name:string;academic_year_name:string;branch_name:string;group_name:string|null;
 allowed_discount_percentages:number[];created_at:string;
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
type StoredOffering=Omit<WebsiteOfferingRow,"status"|"is_website_visible"|"is_accepting_applications"|"allowed_discount_percentages"> & {
 offering_status:"DRAFT"|"ACTIVE"|"RETIRED"|null;is_active:number;show_on_website:number;
 is_accepting_applications:number;allowed_discount_percentages_json:string|null;
};
type Directory={id:string;name:string;code?:string};
export type FeePlanRow={
 id:string;offering_id:string;version:number|null;status:"DRAFT"|"ACTIVE"|"RETIRED";
 billing_cycle:"MONTHLY"|"TERM"|"ONE_TIME";due_day:number|null;currency_code:string;
 effective_from:string|null;effective_to:string|null;change_reason:string|null;
};
export type FeeComponentRow={
 id:string;fee_plan_version_id:string;code:string;name:string;amount:number;
 charge_type:string;recurrence:string;sort_order:number;
};
export type OfferingOverview={
 offerings:WebsiteOfferingRow[];groups:Directory[];years:Array<Directory&{is_active:boolean}>;
 branches:Directory[];classes:Array<Directory&{sort_order:number}>;programs:Directory[];
 plans:FeePlanRow[];components:FeeComponentRow[];
 subjects:Array<{id:string;code:string;name:string}>;
 offeringSubjects:Array<{offering_id:string;subject_id:string;sort_order:number}>;
};
async function catalogue(){
 const rows=await env.DB.prepare("SELECT * FROM public_programme_offerings ORDER BY created_at DESC,id").all<StoredOffering>();
 return (rows.results??[]).map<WebsiteOfferingRow>(row=>{
  let allowed:number[]=[];
  try{const value=JSON.parse(row.allowed_discount_percentages_json??"[]");if(Array.isArray(value))allowed=value.filter((p):p is number=>Number.isInteger(p)&&p>=5&&p<=30&&p%5===0);}catch{}
  return {...row,status:row.offering_status??(row.is_active?"ACTIVE":"DRAFT"),
   allowed_discount_percentages:[...new Set(allowed)].sort((a,b)=>a-b),
   is_website_visible:Boolean(row.show_on_website),is_accepting_applications:Boolean(row.is_accepting_applications)};
 });
}
async function subjectLinks(){
 const [subjects,links]=await Promise.all([
  env.DB.prepare("SELECT id,code,name FROM academy_subjects WHERE active=1 ORDER BY name,id").all<{id:string;code:string;name:string}>(),
  env.DB.prepare("SELECT offering_id,subject_id,sort_order FROM academy_offering_subjects ORDER BY offering_id,sort_order,subject_id").all<{offering_id:string;subject_id:string;sort_order:number}>()
 ]);
 return {subjects:subjects.results??[],offeringSubjects:links.results??[]};
}
/** Original academic/fee workspace. Named finance permission gates both money queries. */
export async function getOfferingOverview():Promise<OfferingOverview>{
 const context=await getErpContext();
 await requirePermission(context?.permissions.includes("academics.view")?"academics.view":"finance.view");
 const finance=context?.permissions.includes("finance.view")??false;
 const [offerings,links,groups,years,branches,classes,programs,plans,components]=await Promise.all([
  catalogue(),subjectLinks(),
  env.DB.prepare("SELECT id,code,name FROM academic_groups WHERE is_active=1 ORDER BY name,id").all<Directory>(),
  env.DB.prepare("SELECT id,code,title AS name,status FROM academic_years ORDER BY starts_on DESC,id").all<Directory&{status:string}>(),
  env.DB.prepare("SELECT id,code,name FROM academy_branches WHERE is_active=1 ORDER BY name,id").all<Directory>(),
  env.DB.prepare("SELECT id,code,name,sort_order FROM academy_classes WHERE is_active=1 ORDER BY sort_order,name,id").all<Directory&{sort_order:number}>(),
  env.DB.prepare("SELECT id,code,name FROM academy_programmes WHERE active=1 ORDER BY name,id").all<Directory>(),
  finance?env.DB.prepare("SELECT id,offering_id,source_version AS version,COALESCE(source_status,CASE WHEN active=1 THEN 'ACTIVE' ELSE 'RETIRED' END) AS status,COALESCE(billing_cycle,'MONTHLY') AS billing_cycle,due_day,COALESCE(currency_code,'BDT') AS currency_code,effective_from,effective_to,change_reason FROM academy_fee_plans ORDER BY offering_id,COALESCE(source_version,0) DESC,rowid DESC").all<FeePlanRow>():Promise.resolve({results:[] as FeePlanRow[]}),
  finance?env.DB.prepare([
   "SELECT id,plan_id AS fee_plan_version_id,code,name,amount_paisa/100.0 AS amount,charge_type,recurrence,sort_order FROM academy_fee_plan_components",
   "UNION ALL SELECT 'legacy-tuition:'||id,id,'TUITION','Tuition',monthly_amount_paisa/100.0,'TUITION','PER_CYCLE',0 FROM academy_fee_plans WHERE source_version IS NULL",
   "UNION ALL SELECT 'legacy-admission:'||id,id,'ADMISSION','Admission',admission_amount_paisa/100.0,'ADMISSION','ONE_TIME',1 FROM academy_fee_plans WHERE source_version IS NULL AND admission_amount_paisa>0",
   "ORDER BY sort_order,id"
  ].join(" ")).all<FeeComponentRow>():Promise.resolve({results:[] as FeeComponentRow[]})
 ]);
 return {offerings,...links,groups:groups.results??[],years:(years.results??[]).map(row=>({...row,is_active:row.status==="ACTIVE"})),
  branches:branches.results??[],classes:classes.results??[],programs:programs.results??[],
  plans:plans.results??[],components:components.results??[]};
}
/** Website editing intentionally fetches no financial terms or student records. */
export async function getWebsiteOfferings():Promise<Pick<OfferingOverview,"offerings"|"subjects"|"offeringSubjects">>{
 await requirePermission("academics.manage");
 const [offerings,links]=await Promise.all([catalogue(),subjectLinks()]);
 return {offerings,...links};
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
