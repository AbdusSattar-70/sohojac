import {env} from "cloudflare:workers";
import {requirePermission} from "@/modules/platform/auth/erp-context";
import type {ProspectStatus} from "@/modules/crm/prospect-status";

export type SubmissionIntent="interest"|"admission";
export type PersistedProspectStatus=ProspectStatus|"LEGACY_CLOSED";
export type ProspectListRow={
 id:string;prospectNo:string;studentName:string;guardianName:string;mobile:string;
 className:string;schoolName:string;schoolNeedsReview:boolean;sourceName:string;
 assignedTo:string;assignedStaffId:string|null;status:PersistedProspectStatus;
 nextFollowUpAt:string|null;createdAt:string;submissionIntent:SubmissionIntent;
 offeringLabel:string;
};
export type ProspectListPage={
 rows:ProspectListRow[];total:number;page:number;pageSize:number;
};
type Core={
 id:string;prospect_no:string;status:PersistedProspectStatus;assigned_to_staff_id:string|null;
 next_follow_up_at:string|null;lost_reason:string|null;created_at:string;
 reference:string;intent:SubmissionIntent;student_name:string;guardian_name:string;
 mobile:string;alternate_mobile:string|null;class_name:string;school_name:string|null;
 guardian_relationship:string|null;area:string|null;preferred_schedule:string|null;
 preferred_days_json:string;subjects_json:string;trial_interest:number;
 referral_note:string|null;notes:string|null;offering_id:string|null;
 offering_name:string|null;offering_code:string|null;assigned_name:string|null;
};
const columns=[
 "p.id,p.prospect_no,p.status,p.assigned_to_staff_id,p.next_follow_up_at,",
 "p.lost_reason,p.created_at,e.reference,e.intent,e.student_name,e.guardian_name,",
 "e.mobile,e.alternate_mobile,e.class_name,e.school_name,e.guardian_relationship,",
 "e.area,e.preferred_schedule,e.preferred_days_json,e.subjects_json,",
 "e.trial_interest,e.referral_note,e.notes,e.offering_id,",
 "o.name AS offering_name,o.code AS offering_code,s.full_name AS assigned_name"
].join(" ");
const joins=[
 "FROM academy_prospects p",
 "JOIN public_enquiries e ON e.id=p.id",
 "LEFT JOIN public_programme_offerings o ON o.id=e.offering_id",
 "LEFT JOIN academy_staff s ON s.id=p.assigned_to_staff_id"
].join(" ");
function parseLabels(value:string):string[]{
 try{
  const parsed:unknown=JSON.parse(value);
  return Array.isArray(parsed)?parsed.filter((v):v is string=>typeof v==="string"):[];
 }catch{return [];}
}
function offeringLabel(v:Core){
 if(v.offering_name)return v.offering_code?v.offering_code+" — "+v.offering_name:v.offering_name;
 return "General interest · unverified";
}
function mapRow(v:Core):ProspectListRow{
 return {
  id:v.id,prospectNo:v.prospect_no,studentName:v.student_name,
  guardianName:v.guardian_name,mobile:v.mobile,
  className:v.class_name?v.class_name+" · unverified":"Not verified",
  schoolName:v.school_name??"—",schoolNeedsReview:Boolean(v.school_name),
  sourceName:"Public website",assignedTo:v.assigned_name??"Unassigned",
  assignedStaffId:v.assigned_to_staff_id,status:v.status,
  nextFollowUpAt:v.next_follow_up_at,createdAt:v.created_at,
  submissionIntent:v.intent,offeringLabel:offeringLabel(v)
 };
}
const queue=["NEW","CONTACTED","COUNSELLING","FUTURE_FOLLOW_UP"];
const allowedStatus=new Set([
 "QUEUE","ALL","NEW","CONTACTED","COUNSELLING","TRIAL_SCHEDULED",
 "TRIAL_ATTENDED","REGISTERED","CONVERTED","FUTURE_FOLLOW_UP","LOST","LEGACY_CLOSED"
]);
export async function getProspectList({
 page=1,query="",status="QUEUE",intent="ALL",pageSize=50
}:{
 page?:number;query?:string;status?:string;intent?:string;pageSize?:number;
}={}):Promise<ProspectListPage>{
 await requirePermission("crm.prospects.view");
 const safePage=Number.isSafeInteger(page)?Math.max(1,Math.min(10000,page)):1;
 const safeSize=Number.isSafeInteger(pageSize)?Math.min(100,Math.max(10,pageSize)):50;
 const where:string[]=["1=1"],params:(string|number)[]=[];
 if(!allowedStatus.has(status))throw new Error("Unknown prospect status filter");
 if(status==="QUEUE"){where.push("p.status IN (?,?,?,?)");params.push(...queue);}
 else if(status!=="ALL"){where.push("p.status=?");params.push(status);}
 if(intent!=="ALL"){
  if(intent!=="interest"&&intent!=="admission")throw new Error("Unknown submission intent");
  where.push("e.intent=?");params.push(intent);
 }
 const needle=query.trim().slice(0,80);
 if(needle){
  where.push("(instr(lower(e.student_name),lower(?))>0 OR "+
   "instr(lower(e.guardian_name),lower(?))>0 OR "+
   "instr(lower(e.mobile),lower(?))>0 OR "+
   "instr(lower(p.prospect_no),lower(?))>0 OR "+
   "instr(lower(COALESCE(e.school_name,'')),lower(?))>0)");
  params.push(needle,needle,needle,needle,needle);
 }
 const filter=" WHERE "+where.join(" AND ");
 const [rows,total]=await Promise.all([
  env.DB.prepare("SELECT "+columns+" "+joins+filter+
   " ORDER BY p.created_at DESC,p.id DESC LIMIT ? OFFSET ?")
   .bind(...params,safeSize,(safePage-1)*safeSize).all<Core>(),
  env.DB.prepare("SELECT COUNT(*) AS n "+joins+filter)
   .bind(...params).first<{n:number}>()
 ]);
 return {rows:(rows.results??[]).map(mapRow),total:total?.n??0,
  page:safePage,pageSize:safeSize};
}

export type ProspectDetail={
 applicationSnapshot:{class_label?:string;offering_label?:string;
  program_labels?:string[];subject_labels?:string[]}|null;
 id:string;prospectNo:string;studentName:string;guardianName:string;
 relationship:string;mobile:string;alternateMobile:string|null;className:string;
 schoolName:string;schoolNeedsReview:boolean;area:string;preferredSchedule:string|null;
 preferredDays:string[];trialInterest:boolean;sourceName:string;referralNote:string|null;
 notes:string|null;status:PersistedProspectStatus;assignedTo:string;
 assignedStaffId:string|null;nextFollowUpAt:string|null;lostReason:string|null;
 createdAt:string;programs:string[];subjects:string[];
 submissionIntent:SubmissionIntent;offeringLabel:string;
 followups:Array<{id:string;type:string;occurredAt:string;outcome:string|null;
  notes:string;nextFollowUpAt:string|null;recordedBy:string}>;
};
type FollowRow={
 id:string;followup_type:string;occurred_at:string;outcome:string|null;
 notes:string;next_follow_up_at:string|null;recorded_by_name:string;
};
export async function getProspectDetail(id:string):Promise<ProspectDetail|null>{
 await requirePermission("crm.prospects.view");
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id))return null;
 const prospect=await env.DB.prepare("SELECT "+columns+" "+joins+" WHERE p.id=?")
  .bind(id).first<Core>();
 if(!prospect)return null;
 const [current,legacy]=await Promise.all([
  env.DB.prepare(
   "SELECT f.id,f.followup_type,f.occurred_at,f.outcome,f.notes,f.next_follow_up_at,"+
   "COALESCE(u.name,'Former staff member') AS recorded_by_name "+
   "FROM academy_prospect_followups f LEFT JOIN \"user\" u ON u.id=f.recorded_by "+
   "WHERE f.prospect_id=? ORDER BY f.occurred_at DESC LIMIT 100"
  ).bind(id).all<FollowRow>(),
  env.DB.prepare(
   "SELECT h.id,'OTHER' AS followup_type,h.occurred_at,NULL AS outcome,"+
   "h.note AS notes,NULL AS next_follow_up_at,"+
   "COALESCE(u.name,'Former staff member') AS recorded_by_name "+
   "FROM staff_prospect_events h LEFT JOIN \"user\" u ON u.id=h.actor_user_id "+
   "WHERE h.enquiry_id=? ORDER BY h.occurred_at DESC LIMIT 100"
  ).bind(id).all<FollowRow>()
 ]);
 const subjects=parseLabels(prospect.subjects_json);
 const programs=prospect.offering_name?[prospect.offering_name]:[];
 const base=mapRow(prospect);
 return {
  applicationSnapshot:{
   class_label:prospect.class_name,offering_label:prospect.offering_name??"General interest",
   subject_labels:subjects,program_labels:programs
  },
  id:prospect.id,prospectNo:prospect.prospect_no,
  studentName:prospect.student_name,guardianName:prospect.guardian_name,
  relationship:prospect.guardian_relationship??"—",
  mobile:prospect.mobile,alternateMobile:prospect.alternate_mobile??null,
  className:base.className,schoolName:base.schoolName,
  schoolNeedsReview:base.schoolNeedsReview,area:prospect.area??"—",
  preferredSchedule:prospect.preferred_schedule,preferredDays:parseLabels(prospect.preferred_days_json),
  trialInterest:Boolean(prospect.trial_interest),sourceName:base.sourceName,
  referralNote:prospect.referral_note,notes:prospect.notes,
  status:prospect.status,assignedTo:base.assignedTo,
  assignedStaffId:prospect.assigned_to_staff_id,
  nextFollowUpAt:prospect.next_follow_up_at,lostReason:prospect.lost_reason,
  createdAt:prospect.created_at,programs,subjects,
  submissionIntent:prospect.intent,offeringLabel:base.offeringLabel,
  followups:[...(current.results??[]),...(legacy.results??[])]
   .sort((a,b)=>b.occurred_at.localeCompare(a.occurred_at))
   .map(f=>({id:f.id,type:f.followup_type,occurredAt:f.occurred_at,
    outcome:f.outcome,notes:f.notes,nextFollowUpAt:f.next_follow_up_at,
    recordedBy:f.recorded_by_name}))
 };
}
export async function getProspectAssignmentOptions(){
 await requirePermission("crm.prospects.manage");
 const rows=await env.DB.prepare(
  "SELECT id,full_name AS name FROM academy_staff "+
  "WHERE status IN ('ACTIVE','ON_LEAVE') ORDER BY full_name LIMIT 300"
 ).all<{id:string;name:string}>();
 return rows.results??[];
}
