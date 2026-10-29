import {env} from "cloudflare:workers";
import {requirePermission} from "@/modules/platform/auth/erp-context";

/** Source /modules/offerings/ database adapter, Phase 1.
 * Reads the ORIGINAL public catalogue and does not invent UUID foreign keys.
 * Never infer a branch/class/programme relationship from a display label.
 */
export type OfferingD1Record={
 id:string;code:string;name:string;
 class_name:string;academic_year_name:string;branch_name:string;group_name:string|null;
 branch_id:string|null;academic_year_id:string|null;class_id:string|null;
 program_id:string|null;group_id:string|null;
 operation_kind:"SCHOOL"|"COACHING"|"TRAINING"|null;
 offering_status:"DRAFT"|"ACTIVE"|"RETIRED"|null;
 teaching_starts_on:string|null;teaching_ends_on:string|null;
 is_active:number;show_on_website:number;is_accepting_applications:number;
 application_state:"OPEN"|"UPCOMING"|"CLOSED";version:number;
 created_at:string;
};
export type OfferingLinkReview=OfferingD1Record & {
 relationshipStatus:"LINKED"|"UNLINKED";
 missingLinks: Array<"branch"|"academic_year"|"programme">;
};
/** Secured read-only query; public website continues using its existing API. */
export async function listOfferingRelationshipReview():Promise<OfferingLinkReview[]>{
 await requirePermission("academics.view");
 const rows=await env.DB.prepare(`
 SELECT id,code,name,class_name,academic_year_name,branch_name,group_name,
 branch_id,academic_year_id,class_id,program_id,group_id,
 operation_kind,offering_status,teaching_starts_on,teaching_ends_on,
 is_active,show_on_website,is_accepting_applications,application_state,
 version,created_at
 FROM public_programme_offerings ORDER BY created_at DESC LIMIT 200
 `).all<OfferingD1Record>();
 return (rows.results??[]).map(row=>{
  const missingLinks:Array<"branch"|"academic_year"|"programme">=[];
  if(!row.branch_id)missingLinks.push("branch");
  if(!row.academic_year_id)missingLinks.push("academic_year");
  if(!row.program_id)missingLinks.push("programme");
  return {...row,relationshipStatus:missingLinks.length?"UNLINKED":"LINKED",missingLinks};
 });
}
