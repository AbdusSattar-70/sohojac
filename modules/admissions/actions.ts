"use server";
import {env} from "cloudflare:workers";
import {revalidatePath} from "next/cache";
import {getErpContext} from "@/modules/platform/auth/erp-context";
import {commandSchema,type AdmissionCommand} from "./schema";
import {advanceAdmissionReview} from "./review-actions";

type Result={ok:boolean;message:string;field?:string;entityId?:string};
type Enquiry={
 id:string;student_name:string;guardian_name:string;mobile:string;
 school_name:string|null;class_name:string;offering_id:string|null;status:string;
};
async function replay(requestId:string,actor:string){
 return env.DB.prepare("SELECT a.id FROM academy_admission_request_keys k JOIN academy_admissions a ON a.id=k.admission_id WHERE k.request_id=? AND k.actor_id=?")
  .bind(requestId,actor).first<{id:string}>();
}
/** Source prospective-enquiry to DRAFT only. Finance, consent, review and
 * activation are deliberately separate and require their own verified ports.
 */
export async function runAdmissionCommand(input:AdmissionCommand):Promise<Result>{
 const parsed=commandSchema.safeParse(input);
 if(!parsed.success)return {ok:false,message:parsed.error.issues[0]?.message??"Check input.",
  field:parsed.error.issues[0]?.path[0]?.toString()};
 const v=parsed.data;
 const context=await getErpContext();
 if(!context?.permissions.includes("admissions.create"))
  return {ok:false,message:"Admission permission required."};
 if(v.action==="READY"||v.action==="RETURN_TO_DRAFT"){
  const done=await advanceAdmissionReview({
   admissionId:v.admissionId,action:v.action,reason:v.reason
  });
  return {ok:done.ok,message:done.message,entityId:v.admissionId};
 }
 if(v.action!=="CREATE")return {ok:false,message:"This source workflow step is not yet available in the D1 workbench. Do not use an alternate action to bypass verification."};
 const actor=context.profileId;
 const prev=await replay(v.requestId,actor);
 if(prev)return {ok:true,message:"Existing draft recovered.",entityId:prev.id};
 const prospect=await env.DB.prepare([
  "SELECT e.id,e.student_name,e.guardian_name,e.mobile,e.school_name,e.class_name,",
  "e.offering_id,p.status",
  "FROM public_enquiries e JOIN academy_prospects p ON p.id=e.id",
  "WHERE e.id=?"
 ].join(" ")).bind(v.prospectId).first<Enquiry>();
 if(!prospect)return {ok:false,message:"Enquiry not found."};
 if(!["CONTACTED","COUNSELLING","TRIAL_SCHEDULED","TRIAL_ATTENDED","REGISTERED","FUTURE_FOLLOW_UP"].includes(prospect.status))
  return {ok:false,message:"Verify the enquiry in CRM before creating its admission draft."};
 if(prospect.offering_id&&prospect.offering_id!==v.offeringId&&!v.confirmPlacementCorrection)
  return {ok:false,message:"Confirm the changed programme selection against the verified enquiry."};
 const id=crypto.randomUUID(),applicationNo="SA-APP-"+crypto.randomUUID().replaceAll("-","").slice(0,12).toUpperCase();
 try{
  const writes=await env.DB.batch([
   env.DB.prepare([
    "INSERT INTO academy_admissions(id,application_no,enquiry_id,offering_id,status,prepared_by,",
    "student_full_name,class_grade,guardian_full_name,guardian_mobile,school_name,batch_id)",
    "SELECT ?,?,e.id,o.id,'DRAFT',?,e.student_name,NULL,e.guardian_name,e.mobile,e.school_name,b.id",
    "FROM public_enquiries e JOIN academy_prospects ap ON ap.id=e.id",
    "JOIN public_programme_offerings o ON o.id=?",
    "JOIN academy_batches b ON b.id=? AND b.offering_id=o.id",
    "WHERE e.id=? AND ap.status IN ('CONTACTED','COUNSELLING','TRIAL_SCHEDULED','TRIAL_ATTENDED','REGISTERED','FUTURE_FOLLOW_UP')",
    "AND o.is_active=1 AND b.status='ACTIVE'",
    "AND (e.offering_id IS NULL OR e.offering_id=o.id OR ?=1)",
    "AND (SELECT COUNT(*) FROM academy_enrollments en WHERE en.batch_id=b.id AND en.status='ACTIVE')<b.capacity"
   ].join(" ")).bind(id,applicationNo,actor,v.offeringId,v.batchId,v.prospectId,
    v.confirmPlacementCorrection?1:0),
   env.DB.prepare("INSERT INTO academy_admission_request_keys(request_id,admission_id,actor_id) VALUES(?,?,?)")
    .bind(v.requestId,id,actor),
   env.DB.prepare([
    "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,after_json)",
    "VALUES(?,'admission',?,'PROSPECT_DRAFT_CREATED',?,?,?)"
   ].join(" ")).bind(crypto.randomUUID(),id,actor,v.reason,JSON.stringify({
    applicationNo,prospectId:v.prospectId,offeringId:v.offeringId,batchId:v.batchId,
    correctionConfirmed:Boolean(v.confirmPlacementCorrection),origin:"PROSPECT_CONVERSION"
   }))
  ]);
  if(writes.some(w=>w.meta.changes!==1))
   return {ok:false,message:"Prospect, programme or batch is unavailable."};
  for(const p of ["/dashboard/admissions","/dashboard/crm/prospects","/dashboard/governance/audit"])revalidatePath(p);
  return {ok:true,message:"Admission draft created.",entityId:id};
 }catch{
  const old=await replay(v.requestId,actor);
  if(old)return {ok:true,message:"Existing draft recovered.",entityId:old.id};
  return {ok:false,message:"Enquiry may already be linked or batch unavailable. Review the case register before retrying."};
 }
}
