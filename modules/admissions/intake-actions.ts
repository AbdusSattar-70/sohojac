"use server";
import { env } from "cloudflare:workers";
import { revalidatePath } from "next/cache";
import { getErpContext } from "@/modules/platform/auth/erp-context";
import { staffAdmissionIntakeSchema, type StaffAdmissionIntake } from "./intake-schema";

type Replayed={id:string;application_no:string};
async function prior(requestId:string,actorId:string){
 return env.DB.prepare("SELECT a.id,a.application_no FROM academy_admission_request_keys k JOIN academy_admissions a ON a.id=k.admission_id WHERE k.request_id=? AND k.actor_id=?")
  .bind(requestId,actorId).first<Replayed>();
}
/** Creates a real, pending DRAFT only. No public enquiry, student number,
 * invoice or seat reservation. On retry, the same requestId returns the
 * original case to its verified creator rather than duplicating a draft.
 */
export async function createStaffAdmissionIntake(input: StaffAdmissionIntake) {
 const parsed=staffAdmissionIntakeSchema.safeParse(input);
 if(!parsed.success){
  const issue=parsed.error.issues[0];
  return {ok:false as const,message:issue?.message??"Check applicant details.",
    field:issue?.path[0]?.toString()};
 }
 const context=await getErpContext();
 if(!context?.permissions.includes("admissions.create"))
  return {ok:false as const,message:"Admission permission is required."};
 const v=parsed.data,actor=context.profileId;
 const existing=await prior(v.requestId,actor);
 if(existing)return {ok:true as const,admissionId:existing.id,admissionNo:existing.application_no};
 const id=crypto.randomUUID(),appNo="SA-APP-"+crypto.randomUUID().replaceAll("-","").slice(0,12).toUpperCase();
 const details={
  admission_id:id,request_id:v.requestId,student_name_bn:v.studentNameBn??"",
  student_mobile:v.studentMobile??"",student_email:v.studentEmail??"",
  date_of_birth:v.dateOfBirth??"",gender:v.gender??"",school_roll:v.schoolRoll??"",
  guardian_relationship:v.guardianRelationship??"",
  alternate_mobile:v.alternateMobile??"",guardian_address:v.guardianAddress,
  present_landmark:v.presentLandmark??"",permanent_same_as_present:v.permanentSameAsPresent?1:0,
  father_name:v.fatherName??"",mother_name:v.motherName??"",
  birth_registration:v.birthRegistration??"",permanent_address:v.permanentAddress??"",
  emergency_contact:v.emergencyContact??"",emergency_mobile:v.emergencyMobile??"",
  previous_result:v.previousResult??"",learning_needs:v.learningNeeds??"",
  referral_note:v.referralNote??"",contact_consent:v.consentToContact?1:0,
  recorded_by:actor,
 };
 const entries=Object.entries(details);
 const columns=entries.map(([key])=>key).join(",");
 const placeholders=entries.map(()=>"?").join(",");
 try{
  const writes=await env.DB.batch([
   env.DB.prepare([
    "INSERT INTO academy_admissions",
    "(id,application_no,enquiry_id,offering_id,status,prepared_by,student_full_name,",
    "class_grade,guardian_full_name,guardian_mobile,school_name,batch_id)",
    "SELECT ?,?,NULL,p.id,'DRAFT',?,?,NULL,?,?,NULLIF(?,''),b.id",
    "FROM public_programme_offerings p",
    "JOIN academy_batches b ON b.offering_id=p.id AND b.id=?",
    "WHERE p.id=? AND p.is_active=1 AND b.status='ACTIVE'",
    "AND (SELECT COUNT(*) FROM academy_enrollments e",
    "WHERE e.batch_id=b.id AND e.status='ACTIVE') < b.capacity",
   ].join(" ")).bind(id,appNo,actor,v.studentName,v.guardianName,v.mobile,
    v.schoolName??"",v.batchId,v.offeringId),
   env.DB.prepare("INSERT INTO academy_admission_intake_details("+columns+") VALUES("+placeholders+")")
    .bind(...entries.map(([,value])=>value)),
   env.DB.prepare("INSERT INTO academy_admission_request_keys(request_id,admission_id,actor_id) VALUES(?,?,?)")
    .bind(v.requestId,id,actor),
   env.DB.prepare("INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,after_json) VALUES(?,'admission',?,'STAFF_DRAFT_CREATED',?,?,?)")
    .bind(crypto.randomUUID(),id,actor,v.reason,JSON.stringify({
     applicationNo:appNo,offeringId:v.offeringId,batchId:v.batchId,
     contactConsent:v.consentToContact,origin:"DIRECT_STAFF"
    }))
  ]);
  if(writes.some(w=>w.meta.changes!==1))
   return {ok:false as const,message:"The selected programme or batch is inactive or full. Reload and select another."};
  for(const p of ["/dashboard/admissions","/dashboard/students","/dashboard/governance/audit"])revalidatePath(p);
  return {ok:true as const,admissionId:id,admissionNo:appNo};
 }catch{
  const replay=await prior(v.requestId,actor);
  if(replay)return {ok:true as const,admissionId:replay.id,admissionNo:replay.application_no};
  return {ok:false as const,message:"Could not create the draft. Check active offering, batch capacity and details before retrying."};
 }
}
