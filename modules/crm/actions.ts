"use server";
import {revalidatePath} from "next/cache";
import {headers} from "next/headers";
import {env} from "cloudflare:workers";
import {getErpContext} from "@/modules/platform/auth/erp-context";
import {recordProspectFollowupSchema,type RecordProspectFollowupInput} from "@/modules/crm/schema";
import {allowedProspectStatuses,prospectStatuses,type ProspectStatus} from "@/modules/crm/prospect-status";

export type ProspectFollowupResult=
 | {ok:true;status:string}
 | {ok:false;error:string;field?:string};
async function validOrigin(){
 const h=await headers(),actual=h.get("origin"),host=h.get("host");
 if(!actual||!host)return false;
 try{return new URL(actual).host.toLowerCase()===host.toLowerCase();}
 catch{return false;}
}
export async function recordProspectFollowup(input:RecordProspectFollowupInput):Promise<ProspectFollowupResult>{
 const parsed=recordProspectFollowupSchema.safeParse(input);
 if(!parsed.success){
  const issue=parsed.error.issues[0];
  return {ok:false,error:issue?.message??"Please check the follow-up information.",
   field:issue?.path?.[0]?.toString()};
 }
 const context=await getErpContext();
 if(!context?.permissions.includes("crm.followups.manage"))
  return {ok:false,error:"You are not authorized to record CRM follow-ups."};
 if(!await validOrigin())return {ok:false,error:"Invalid request origin."};
 const v=parsed.data;
 const nextAt=v.nextFollowUpAt?new Date(v.nextFollowUpAt):null;
 if(nextAt && !Number.isFinite(nextAt.getTime()))
  return {ok:false,error:"Enter a valid follow-up date and time.",field:"nextFollowUpAt"};
 const nextISO=nextAt?.toISOString()??null;
 try{
  const before=await env.DB.prepare(
   "SELECT id,status,version,assigned_to_staff_id,next_follow_up_at,lost_reason "+
   "FROM academy_prospects WHERE id=?"
  ).bind(v.prospectId).first<{
   id:string;status:string;version:number;
   assigned_to_staff_id:string|null;next_follow_up_at:string|null;lost_reason:string|null
  }>();
  if(!before)return {ok:false,error:"Prospect could not be loaded."};
  if(!prospectStatuses.includes(before.status as ProspectStatus))
   return {ok:false,error:"This historical CLOSED request needs status reconciliation before counselling."};
  if(!allowedProspectStatuses(before.status as ProspectStatus).includes(v.newStatus))
   return {ok:false,error:"Status cannot move from "+before.status+" to "+v.newStatus+
    " through a follow-up.",field:"newStatus"};
  const legacySummary=v.newStatus==="NEW"?"NEW":
   ["LOST","CONVERTED"].includes(v.newStatus)?"CLOSED":"CONTACTED";
  const eventId=crypto.randomUUID(),auditId=crypto.randomUUID();
  const nextStatus=v.newStatus,lostReason=v.newStatus==="LOST"?(v.lostReason||null):null;
  const result=await env.DB.batch([
   env.DB.prepare(
    "UPDATE academy_prospects SET status=?,next_follow_up_at=?,lost_reason=?,"+
    "version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "+
    "WHERE id=? AND version=? AND status=?"
   ).bind(nextStatus,nextISO,lostReason,v.prospectId,before.version,before.status),
   env.DB.prepare(
    "INSERT INTO academy_prospect_followups(id,prospect_id,followup_type,notes,outcome,"+
    "from_status,to_status,next_follow_up_at,lost_reason,recorded_by) "+
    "SELECT ?,?,?,?,?,?,?,?,?,? WHERE changes()=1"
   ).bind(eventId,v.prospectId,v.followupType,v.notes,v.outcome||null,
    before.status,nextStatus,nextISO,lostReason,context.profileId),
   env.DB.prepare(
    "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,before_json,after_json) "+
    "SELECT ?,'prospect',?,'FOLLOWUP_RECORDED',?,?,?,? WHERE changes()=1"
   ).bind(auditId,v.prospectId,context.profileId,v.notes,
    JSON.stringify(before),
    JSON.stringify({status:nextStatus,nextFollowUpAt:nextISO,followupId:eventId})),
   env.DB.prepare(
    "UPDATE public_enquiries SET status=? WHERE id=? "+
    "AND EXISTS (SELECT 1 FROM academy_prospects p WHERE p.id=? AND p.status=?)"
   ).bind(legacySummary,v.prospectId,v.prospectId,nextStatus)
  ]);
  if(result.length!==4||result.some(x=>x.meta?.changes!==1))
   return {ok:false,error:"This prospect changed. Refresh and retry."};
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/action-center");
  revalidatePath("/dashboard/crm/prospects");
  revalidatePath("/dashboard/crm/prospects/"+v.prospectId);
  return {ok:true,status:nextStatus};
 }catch{return {ok:false,error:"Could not save this follow-up. Refresh and retry."};}
}
