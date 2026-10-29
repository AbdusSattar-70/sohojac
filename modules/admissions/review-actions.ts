"use server";
import {env} from "cloudflare:workers";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {getErpContext} from "@/modules/platform/auth/erp-context";

const uuid=z.string().uuid();
const placement=z.object({
 admission_id:uuid,
 offering_id:z.string().trim().min(2).max(100),
 batch_id:uuid,
 reason:z.string().trim().min(5).max(500)
}).strict();
const identity=z.object({
 student_name:z.string().trim().min(2).max(160),
 student_name_bn:z.string().trim().max(160),
 student_mobile:z.string().regex(/^$|^01[3-9][0-9]{8}$/),
 student_email:z.union([z.email(),z.literal("")]),
 student_grade:z.coerce.number().int().min(1).max(12),
 guardian_name:z.string().trim().min(2).max(160),
 mobile:z.string().regex(/^01[3-9][0-9]{8}$/),
 alternate_mobile:z.string().regex(/^$|^01[3-9][0-9]{8}$/),
 guardian_address:z.string().trim().min(5).max(300),
 guardian_relationship:z.string().max(80),
 present_landmark:z.string().max(160),
 permanent_address:z.string().max(300),
 permanent_same_as_present:z.enum(["true","false"]),
 date_of_birth:z.union([z.iso.date(),z.literal("")]),
 gender:z.enum(["","Female","Male","Other","Prefer not to say"]),
 school_name:z.string().max(200),
 school_roll:z.string().max(40)
}).strict();
const identityCommand=z.object({
 admission_id:uuid,identity,reason:z.string().trim().min(5).max(500)
}).strict();
type Draft={id:string;version:number;status:string};
async function eligible(id:string){
 return env.DB.prepare("SELECT id,version,status FROM academy_admissions WHERE id=?")
  .bind(id).first<Draft>();
}
function changed(id:string){
 for(const p of ["/dashboard/admissions",`/dashboard/admissions/${id}`,
   `/dashboard/admissions/${id}/print`,"/dashboard/governance/audit"])
  revalidatePath(p);
}
/** Source placement correction. No silent fee/consent reuse on accepted cases. */
export async function correctAdmissionPlacement(input:unknown){
 const parsed=placement.safeParse(input);
 if(!parsed.success)return {ok:false,message:"Choose an active offering and batch, with a reason."};
 const context=await getErpContext();
 if(!context?.permissions.includes("admissions.create"))
  return {ok:false,message:"Admission permission required."};
 const v=parsed.data,old=await eligible(v.admission_id);
 if(!old||old.status!=="DRAFT")return {ok:false,message:"Only an open draft can be corrected."};
 const query=[
  "UPDATE academy_admissions SET offering_id=?,batch_id=?,fee_plan_id=NULL,",
  "consent_verified=0,version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",
  "WHERE id=? AND status='DRAFT' AND version=?",
  "AND EXISTS(SELECT 1 FROM public_programme_offerings p",
  "JOIN academy_batches b ON b.offering_id=p.id",
  "WHERE p.id=? AND p.is_active=1 AND b.id=? AND b.status='ACTIVE'",
  "AND (SELECT COUNT(*) FROM academy_enrollments e",
  "WHERE e.batch_id=b.id AND e.status='ACTIVE')<b.capacity)",
  "RETURNING id"
 ].join(" ");
 try{
  const tx=await env.DB.batch([
   env.DB.prepare(query).bind(v.offering_id,v.batch_id,v.admission_id,
    old.version,v.offering_id,v.batch_id),
   env.DB.prepare([
    "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,before_json,after_json)",
    "SELECT ?,'admission',?,'PLACEMENT_CORRECTED',?,?,?,?,? WHERE changes()=1"
   ].join(" ")).bind(crypto.randomUUID(),v.admission_id,context.profileId,v.reason,
    JSON.stringify({version:old.version}),
    JSON.stringify({offeringId:v.offering_id,batchId:v.batch_id,version:old.version+1}))
  ]);
  if(tx[0].results?.length!==1||tx[1].meta.changes!==1)
   return {ok:false,message:"Placement is no longer available. Refresh and retry."};
  changed(v.admission_id);
  return {ok:true,message:"Placement saved. Fee selection and signed consent require fresh review."};
 }catch{return {ok:false,message:"Placement update failed. Reload the draft."};}
}
/** Original identity review, using D1 compare-and-swap and redacted audit.
 * Cannot change identity after a review, acceptance, bill or enrollment.
 */
export async function editAdmissionIdentity(input:unknown){
 const parsed=identityCommand.safeParse(input);
 if(!parsed.success)return {
  ok:false,message:parsed.error.issues[0]?.message??"Check the student details."
 };
 const context=await getErpContext();
 if(!context?.permissions.includes("admissions.create"))
  return {ok:false,message:"Admission permission required."};
 const v=parsed.data,old=await eligible(v.admission_id);
 if(!old||old.status!=="DRAFT")
  return {ok:false,message:"Return this case to DRAFT with authorization before correcting it."};
 const a=v.identity,cols=[
  "student_mobile","student_email","present_landmark","permanent_address",
  "permanent_same_as_present","student_name_bn","alternate_mobile",
  "guardian_address","guardian_relationship","date_of_birth","gender","school_roll"
 ] as const;
 const values:Record<(typeof cols)[number],string|number>={
  student_mobile:a.student_mobile,student_email:a.student_email,
  present_landmark:a.present_landmark,permanent_address:a.permanent_address,
  permanent_same_as_present:a.permanent_same_as_present==="true"?1:0,
  student_name_bn:a.student_name_bn,alternate_mobile:a.alternate_mobile,
  guardian_address:a.guardian_address,guardian_relationship:a.guardian_relationship,
  date_of_birth:a.date_of_birth,gender:a.gender,school_roll:a.school_roll
 };
 const keys=Object.keys(values);
 const newId=crypto.randomUUID(),requestId=crypto.randomUUID();
 const upsert=[
  "INSERT INTO academy_admission_intake_details",
  "(admission_id,request_id,recorded_by,"+keys.join(",")+")",
  "SELECT ?,?,?,"+keys.map(()=>"?").join(","),
  "WHERE changes()=1",
  "ON CONFLICT(admission_id) DO UPDATE SET "+
   keys.map(k=>k+"=excluded."+k).join(","),
  "RETURNING admission_id"
 ].join(" ");
 try{
  const tx=await env.DB.batch([
   env.DB.prepare([
    "UPDATE academy_admissions SET student_full_name=?,class_grade=?,",
    "guardian_full_name=?,guardian_mobile=?,school_name=?,",
    "version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",
    "WHERE id=? AND status='DRAFT' AND version=? RETURNING id"
   ].join(" ")).bind(a.student_name,a.student_grade,a.guardian_name,a.mobile,
    a.school_name||null,v.admission_id,old.version),
   env.DB.prepare(upsert).bind(v.admission_id,requestId,context.profileId,
    ...keys.map(k=>values[k as keyof typeof values])),
   env.DB.prepare([
    "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,before_json,after_json)",
    "SELECT ?,'admission',?,'IDENTITY_CORRECTED',?,?,?,?,? WHERE changes()=1"
   ].join(" ")).bind(crypto.randomUUID(),v.admission_id,context.profileId,v.reason,
    JSON.stringify({version:old.version}),
    JSON.stringify({version:old.version+1,fields:Object.keys(a)}))
  ]);
  if(tx.some(x=>(x.results?.length??0)!==1 && x.meta.changes!==1))
   return {ok:false,message:"Case changed. Reload to review the latest saved details."};
  changed(v.admission_id);
  return {ok:true,message:"Application details saved. Verify the corrected identity and paper consent before approval."};
 }catch{return {ok:false,message:"Identity update could not be confirmed. Reload the case before retrying."};}
}
