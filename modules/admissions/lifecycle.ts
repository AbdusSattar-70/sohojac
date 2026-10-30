"use server";
import {env} from "cloudflare:workers";
import {revalidatePath} from "next/cache";
import {z} from "zod";
import {getErpContext,requirePermission} from "@/modules/platform/auth/erp-context";

type Outcome={ok:boolean;message:string};
const uuid=z.string().uuid();
const note=z.string().trim().min(5).max(500);
const today=()=>new Date().toISOString().slice(0,10);
function refresh(id:string){
 for(const path of ["/dashboard/admissions",`/dashboard/admissions/${id}`,`/dashboard/admissions/${id}/print`,"/dashboard/students","/dashboard/finance/billing","/dashboard/governance/audit"])revalidatePath(path);
}
async function actor(permission="admissions.create"){
 const context=await getErpContext();
 return context?.permissions.includes(permission)?context.profileId:null;
}
type State={id:string;status:string;version:number;offering_id:string;batch_id:string|null;
 student_id:string|null;student_full_name:string;guardian_full_name:string;guardian_mobile:string;
 class_grade:number|null;school_name:string|null;fee_plan_id:string|null;consent_verified:number;
};
async function state(id:string){
 return env.DB.prepare("SELECT id,status,version,offering_id,batch_id,student_id,student_full_name,guardian_full_name,guardian_mobile,class_grade,school_name,fee_plan_id,consent_verified FROM academy_admissions WHERE id=?").bind(id).first<State>();
}
type Person={id:string;full_name:string;mobile:string|null;staff_id:string|null};
type Staff={id:string;full_name:string};
type Source={admission_id:string;source:string;referrer_id:string|null;staff_id:string|null};
type Consent={identity_revision:number;guardian_signed_on:string;student_signed:number;physical_copy_reference:string|null};
type Discount={discount_percent:number;discount_reason:string|null};
type Extra={id:string;charge_type:string;name:string;amount_paisa:number;is_active:number};
type Plan={id:string;monthly_amount_paisa:number;admission_amount_paisa:number;title:string};
type OfferingPolicy={allowed_discount_percentages_json:string|null};
export async function getAdmissionReviewData(admissionId:string){
 await requirePermission("admissions.view");
 const id=uuid.parse(admissionId);
 const [caseRow,people,staff,source,consent,discount,extras,plan,policy]=await Promise.all([
  state(id),
  env.DB.prepare("SELECT id,full_name,mobile,staff_id FROM academy_referrer_people WHERE is_active=1 ORDER BY full_name LIMIT 300").all<Person>(),
  env.DB.prepare("SELECT id,full_name FROM academy_staff WHERE status='ACTIVE' ORDER BY full_name LIMIT 300").all<Staff>(),
  env.DB.prepare("SELECT admission_id,source,referrer_id,staff_id FROM academy_admission_referrals WHERE admission_id=?").bind(id).first<Source>(),
  env.DB.prepare("SELECT identity_revision,guardian_signed_on,student_signed,physical_copy_reference FROM academy_admission_consents WHERE admission_id=?").bind(id).first<Consent>(),
  env.DB.prepare("SELECT discount_percent,discount_reason FROM academy_admission_discounts WHERE admission_id=?").bind(id).first<Discount>(),
  env.DB.prepare("SELECT id,charge_type,name,amount_paisa,is_active FROM academy_admission_extra_charges WHERE admission_id=? ORDER BY created_at,id").bind(id).all<Extra>(),
  env.DB.prepare("SELECT f.id,f.title,f.monthly_amount_paisa,f.admission_amount_paisa FROM academy_fee_plans f JOIN academy_admissions a ON a.offering_id=f.offering_id WHERE a.id=? AND f.active=1 ORDER BY f.rowid DESC LIMIT 1").bind(id).first<Plan>(),
  env.DB.prepare("SELECT o.allowed_discount_percentages_json FROM public_programme_offerings o JOIN academy_admissions a ON a.offering_id=o.id WHERE a.id=?").bind(id).first<OfferingPolicy>()
 ]);
 if(!caseRow)throw new Error("Admission case not found.");
 let configured:number[]=[];
 try{const parsed=JSON.parse(policy?.allowed_discount_percentages_json??"[]");if(Array.isArray(parsed))configured=parsed.filter((x):x is number=>Number.isInteger(x)&&x>0&&x<=30);}catch{}
 const allowed=[0,...new Set(configured)].sort((a,b)=>a-b);
 const signed=Boolean(consent&&caseRow.consent_verified===1&&(consent.identity_revision===caseRow.version||(["BILLED","ENROLLED"].includes(caseRow.status)&&consent.identity_revision<caseRow.version)));
 const charges=(extras.results??[]).map(x=>({id:x.id,name:x.name,chargeType:x.charge_type,amount:x.amount_paisa/100,is_active:x.is_active===1}));
 const tuition=plan?.monthly_amount_paisa??0,admission=plan?.admission_amount_paisa??0;
 const additional=(extras.results??[]).filter(x=>x.is_active===1).reduce((sum,x)=>sum+x.amount_paisa,0);
 const percent=discount?.discount_percent??0;
 const due=Math.max(0,tuition-Math.round(tuition*percent/100))+admission+additional;
 return {
  referrals:{people:people.results??[],staff:staff.results??[],
   choices:source?[{admission_id:id,source:source.source,referrer_id:source.referrer_id,staff_id:source.staff_id}]:[]},
  referral:source,
  consent:consent?{...consent,isCurrent:signed}:null,
  hasConsent:signed,
  discount:{allowed,selected:percent,reason:discount?.discount_reason??null},
  charges,
  plan:plan?{id:plan.id,title:plan.title,tuition:tuition/100,admission:admission/100}:null,
  estimate:{tuition:tuition/100,admission:admission/100,extra:additional/100,discountPercent:percent,due:due/100},
  version:caseRow.version
 };
}

const referralInput=z.object({
 action:z.literal("CAPTURE"),admissionId:uuid,source:z.enum(["ORGANIC","REFERRED"]),
 staffId:uuid.optional(),referrerId:uuid.optional(),fullName:z.string().trim().min(2).max(160).optional(),
 mobile:z.string().regex(/^01[3-9][0-9]{8}$/).optional(),relationshipNote:z.string().trim().max(160).optional(),
 contactNote:z.string().trim().max(500).optional(),reason:note
});
export async function runReferralCommand(input:unknown):Promise<Outcome>{
 const p=referralInput.safeParse(input);
 if(!p.success)return {ok:false,message:p.error.issues[0]?.message??"Check admission source."};
 const user=await actor();if(!user)return {ok:false,message:"Admission permission required."};
 const v=p.data,old=await state(v.admissionId);
 if(!old||old.status!=="REVIEW")return {ok:false,message:"Source may only be recorded after application verification."};
 if(v.source==="REFERRED"&&!v.staffId&&!v.referrerId&&(!v.fullName||!v.mobile))
  return {ok:false,message:"Choose an existing referrer or enter a new name and valid mobile."};
 if(v.source==="ORGANIC"&&(v.staffId||v.referrerId||v.fullName))
  return {ok:false,message:"Organic admissions must not have a referrer."};
 const newId=v.source==="REFERRED"&&!v.staffId&&!v.referrerId?crypto.randomUUID():null;
 try{
  const statements=[];
  if(newId)statements.push(env.DB.prepare(
   "INSERT INTO academy_referrer_people(id,full_name,mobile,relationship_note,contact_note,created_by) VALUES(?,?,?,?,?,?)"
  ).bind(newId,v.fullName,v.mobile,v.relationshipNote??null,v.contactNote??null,user));
  statements.push(env.DB.prepare([
   "INSERT INTO academy_admission_referrals(admission_id,source,referrer_id,staff_id,recorded_by,reason)",
   "SELECT ?,?,?,?,?,? FROM academy_admissions a WHERE a.id=? AND a.status='REVIEW'",
   "AND (?='ORGANIC' OR EXISTS(SELECT 1 FROM academy_referrer_people p WHERE p.id=? AND p.is_active=1)",
   "OR EXISTS(SELECT 1 FROM academy_staff s WHERE s.id=? AND s.status='ACTIVE'))",
   "ON CONFLICT(admission_id) DO UPDATE SET source=excluded.source,referrer_id=excluded.referrer_id,",
   "staff_id=excluded.staff_id,recorded_by=excluded.recorded_by,reason=excluded.reason,",
   "updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') RETURNING admission_id"
  ].join(" ")).bind(v.admissionId,v.source,newId??v.referrerId??null,v.source==="REFERRED"?v.staffId??null:null,user,v.reason,
    v.admissionId,v.source,newId??v.referrerId??"",v.staffId??""));
  statements.push(env.DB.prepare([
   "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,after_json)",
   "VALUES(?,'admission',(SELECT admission_id FROM academy_admission_referrals WHERE admission_id=?),",
   "'REFERRAL_SOURCE_CAPTURED',?,?,?)"
  ].join(" ")).bind(crypto.randomUUID(),v.admissionId,user,v.reason,JSON.stringify({source:v.source,referrerId:newId??v.referrerId??null,staffId:v.staffId??null})));
  const result=await env.DB.batch(statements);
  if(result.some((r,i)=>i===statements.length-2?(r.results?.length??0)!==1:(r.meta.changes??0)<1))
   return {ok:false,message:"Source not recorded. Refresh the case."};
  refresh(v.admissionId);
  return {ok:true,message:"Verified admission source recorded."};
 }catch{return {ok:false,message:"Could not record admission source. Check case status and referrer."};}
}

const consentInput=z.object({
 admissionId:uuid,requestId:uuid,guardianSignedOn:z.iso.date(),studentSigned:z.boolean(),
 physicalCopyReference:z.string().trim().max(160).optional(),reason:note
});
export async function receivePhysicalConsent(input:unknown):Promise<Outcome>{
 const p=consentInput.safeParse(input);
 if(!p.success)return {ok:false,message:p.error.issues[0]?.message??"Check the signed paper details."};
 const user=await actor();if(!user)return {ok:false,message:"Admission permission required."};
 const v=p.data,old=await state(v.admissionId);
 if(!old||old.status!=="REVIEW")return {ok:false,message:"Verify application and source before receiving paper consent."};
 if(v.guardianSignedOn>today())return {ok:false,message:"Guardian signing date cannot be in the future."};
 try{
  const result=await env.DB.batch([
   env.DB.prepare([
    "UPDATE academy_admissions SET consent_verified=1",
    "WHERE id=? AND status='REVIEW' AND version=?",
    "AND EXISTS(SELECT 1 FROM academy_admission_referrals r WHERE r.admission_id=academy_admissions.id)",
    "RETURNING id"
   ].join(" ")).bind(v.admissionId,old.version),
   env.DB.prepare([
    "INSERT INTO academy_admission_consents(admission_id,identity_revision,guardian_signed_on,student_signed,physical_copy_reference,received_by,reason)",
    "SELECT ?,?,?,?,?,?,? WHERE changes()=1",
    "ON CONFLICT(admission_id) DO UPDATE SET identity_revision=excluded.identity_revision,",
    "guardian_signed_on=excluded.guardian_signed_on,student_signed=excluded.student_signed,",
    "physical_copy_reference=excluded.physical_copy_reference,received_by=excluded.received_by,",
    "reason=excluded.reason,recorded_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') RETURNING admission_id"
   ].join(" ")).bind(v.admissionId,old.version,v.guardianSignedOn,v.studentSigned?1:0,v.physicalCopyReference??null,user,v.reason),
   env.DB.prepare([
    "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,after_json)",
    "VALUES(?,'admission',(SELECT admission_id FROM academy_admission_consents WHERE admission_id=? AND identity_revision=?),",
    "'PAPER_CONSENT_RECEIVED',?,?,?)"
   ].join(" ")).bind(crypto.randomUUID(),v.admissionId,old.version,user,v.reason,JSON.stringify({revision:old.version,guardianSignedOn:v.guardianSignedOn,studentSigned:v.studentSigned,reference:v.physicalCopyReference??null}))
  ]);
  if(result.some(x=>(x.results?.length??0)!==1 && x.meta.changes===0))return {ok:false,message:"Application changed; reload."};
  refresh(v.admissionId);return {ok:true,message:"Signed paper consent verified for this application revision."};
 }catch{return {ok:false,message:"Could not record paper consent. Reload and verify the application."};}
}
const extraInput=z.object({admission_id:uuid,request_id:uuid,name:z.string().trim().min(2).max(100),
 amount:z.number().positive().max(99999999),charge_type:z.enum(["ADMISSION","EXAM","MATERIAL","OTHER"])});
export async function saveExtraCharge(input:unknown):Promise<Outcome>{
 const p=extraInput.safeParse(input);
 if(!p.success)return {ok:false,message:"Choose the charge and enter a positive amount."};
 const user=await actor();if(!user)return {ok:false,message:"Admission permission required."};
 const v=p.data,amount=Math.round(v.amount*100),id=crypto.randomUUID();
 const duplicate=await env.DB.prepare("SELECT id FROM academy_admission_extra_charges WHERE request_id=? AND admission_id=?").bind(v.request_id,v.admission_id).first<{id:string}>();
 if(duplicate)return {ok:true,message:"Previously saved charge confirmed; not duplicated."};
 if(!Number.isSafeInteger(amount)||amount<1)return {ok:false,message:"Invalid amount."};
 const old=await state(v.admission_id);
 if(!old||old.status!=="REVIEW")return {ok:false,message:"Only verified, unbilled cases allow extra charges."};
 try{
  const result=await env.DB.batch([
   env.DB.prepare([
    "INSERT INTO academy_admission_extra_charges(id,request_id,admission_id,charge_type,name,amount_paisa,recorded_by)",
    "SELECT ?,?,?,?,?,?,? FROM academy_admissions WHERE id=? AND status='REVIEW' AND version=? RETURNING id"
   ].join(" ")).bind(id,v.request_id,v.admission_id,v.charge_type,v.name,amount,user,v.admission_id,old.version),
   env.DB.prepare([
    "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,after_json)",
    "SELECT ?,'admission',admission_id,'ONE_TIME_CHARGE_ADDED',?,?,?",
    "FROM academy_admission_extra_charges WHERE id=? AND changes()=1 RETURNING id"
   ].join(" ")).bind(crypto.randomUUID(),user,"Additional fee agreed with guardian",JSON.stringify({chargeType:v.charge_type,amountPaisa:amount}),id)
  ]);
  if(result.some(r=>(r.results?.length??0)!==1))return {ok:false,message:"Only verified, unbilled cases allow extra charges."};
  refresh(v.admission_id);return {ok:true,message:"One-time charge added to the pre-billing review."};
 }catch{
  const replay=await env.DB.prepare("SELECT id FROM academy_admission_extra_charges WHERE request_id=? AND admission_id=?").bind(v.request_id,v.admission_id).first<{id:string}>();
  return replay?{ok:true,message:"Previously saved charge confirmed; not duplicated."}:{ok:false,message:"Could not save charge. Check case status."};
 }
}
export async function deactivateExtraCharge(admissionId:string,chargeId:string):Promise<Outcome>{
 if(!uuid.safeParse(admissionId).success||!uuid.safeParse(chargeId).success)return {ok:false,message:"Invalid charge."};
 const user=await actor();if(!user)return {ok:false,message:"Admission permission required."};
 const old=await state(admissionId);
 if(!old||old.status!=="REVIEW")return {ok:false,message:"Charge is not editable."};
 try{
  const tx=await env.DB.batch([
   env.DB.prepare([
    "UPDATE academy_admission_extra_charges SET is_active=0",
    "WHERE id=? AND admission_id=? AND is_active=1",
    "AND EXISTS(SELECT 1 FROM academy_admissions a WHERE a.id=? AND a.status='REVIEW' AND a.version=?) RETURNING id"
   ].join(" ")).bind(chargeId,admissionId,admissionId,old.version),
   env.DB.prepare([
    "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,after_json)",
    "SELECT ?,'admission',admission_id,'ONE_TIME_CHARGE_DEACTIVATED',?,?,?",
    "FROM academy_admission_extra_charges WHERE id=? AND admission_id=? AND is_active=0 AND changes()=1 RETURNING id"
   ].join(" ")).bind(crypto.randomUUID(),user,"Removed unbilled additional charge",JSON.stringify({chargeId}),chargeId,admissionId)
  ]);
  if(tx.some(r=>(r.results?.length??0)!==1))return {ok:false,message:"Charge is not editable."};
  refresh(admissionId);return {ok:true,message:"Charge marked inactive; historical record retained."};
 }catch{return {ok:false,message:"Could not deactivate charge."};}
}
const discountInput=z.object({admissionId:uuid,discountPercent:z.number().int().min(0).max(30),discountReason:z.string().trim().max(80),reason:note});
export async function saveAdmissionDiscount(input:unknown):Promise<Outcome>{
 const p=discountInput.safeParse(input);if(!p.success)return {ok:false,message:"Invalid discount."};
 const user=await actor("finance.billing.manage");if(!user)return {ok:false,message:"Billing permission required."};
 const v=p.data,old=await state(v.admissionId);
 if(!old||old.status!=="REVIEW")return {ok:false,message:"Discounts can only be saved before final billing."};
 if(v.discountPercent>0&&!v.discountReason)return {ok:false,message:"Select the reason for the tuition discount."};
 const info=await getAdmissionReviewData(v.admissionId);
 if(!info.discount.allowed.includes(v.discountPercent))return {ok:false,message:"This discount percentage is not approved for the offering."};
 try{
  const tx=await env.DB.batch([
   env.DB.prepare([
    "INSERT INTO academy_admission_discounts(admission_id,discount_percent,discount_reason,recorded_by)",
    "SELECT ?,?,?,? FROM academy_admissions a WHERE a.id=? AND a.status='REVIEW' AND a.version=?",
    "AND (?=0 OR EXISTS(SELECT 1 FROM public_programme_offerings o,",
    "json_each(CASE WHEN json_valid(o.allowed_discount_percentages_json) THEN o.allowed_discount_percentages_json ELSE '[]' END) p",
    "WHERE o.id=a.offering_id AND p.type IN ('integer','real') AND p.value=?))",
    "ON CONFLICT(admission_id) DO UPDATE SET discount_percent=excluded.discount_percent,discount_reason=excluded.discount_reason,",
    "recorded_by=excluded.recorded_by,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') RETURNING admission_id"
   ].join(" ")).bind(v.admissionId,v.discountPercent,v.discountPercent?v.discountReason:null,user,v.admissionId,old.version,v.discountPercent,v.discountPercent),
   env.DB.prepare([
    "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,after_json)",
    "SELECT ?,'admission',admission_id,'TUITION_DISCOUNT_SAVED',?,?,?",
    "FROM academy_admission_discounts WHERE admission_id=? AND changes()=1 RETURNING id"
   ].join(" ")).bind(crypto.randomUUID(),user,v.reason,JSON.stringify({discountPercent:v.discountPercent,discountReason:v.discountReason||null}),v.admissionId)
  ]);
  if(tx.some(r=>(r.results?.length??0)!==1))return {ok:false,message:"Case or discount policy changed; discount not saved."};
  refresh(v.admissionId);return {ok:true,message:"Tuition discount saved for final review."};
 }catch{return {ok:false,message:"Could not save tuition discount."};}
}

const finalizeInput=z.object({admissionId:uuid,requestId:uuid,reason:note});
export async function finalizeAdmission(input:unknown):Promise<Outcome>{
 const p=finalizeInput.safeParse(input);if(!p.success)return {ok:false,message:"Invalid final review."};
 const user=await actor("finance.billing.manage");if(!user)return {ok:false,message:"Billing permission required."};
 const v=p.data,old=await state(v.admissionId);
 if(!old)return {ok:false,message:"Case not found."};
 if(old.status==="BILLED"||old.status==="ENROLLED")return {ok:true,message:"Admission already finalized; existing billing retained."};
 if(old.status!=="REVIEW"||!old.batch_id)return {ok:false,message:"Complete application verification before final submission."};
 const data=await getAdmissionReviewData(v.admissionId);
 if(data.version!==old.version)return {ok:false,message:"Application changed; reload the final review."};
 if(!data.referral||!data.hasConsent||!data.plan)return {ok:false,message:"Record source, signed paper consent and an active fee plan before final submission."};
 if(!data.discount.allowed.includes(data.discount.selected))return {ok:false,message:"Saved discount is no longer allowed. Recheck the offering policy."};
 const tuition=Math.round(data.plan.tuition*100),admission=Math.round(data.plan.admission*100);
 const discount=Math.round(tuition*data.discount.selected/100),monthly=Math.max(0,tuition-discount);
 const extra=data.charges.filter(x=>x.is_active).reduce((n,x)=>n+Math.round(x.amount*100),0);
 const registration=admission+extra,total=monthly+registration;
 if(!Number.isSafeInteger(total)||total<0)return {ok:false,message:"Invalid fee amount."};
 const studentId=old.student_id??crypto.randomUUID(),invoiceId=crypto.randomUUID(),billId=crypto.randomUUID();
 // Validate the live fee snapshot before the first write in this D1 transaction.
 // Fee edits retain the identity revision so existing signed consent stays valid.
 // A changed discount, charge total, policy or latest plan rejects this snapshot;
 // changes() gates every following write, including the sequence and audit trail.
 // Assign the original sequential SA-000001 identifier inside the D1 transaction.
 const reference="SA-BILL-"+crypto.randomUUID().replaceAll("-","").slice(0,12).toUpperCase();
 try{
  const tx=await env.DB.batch([
   env.DB.prepare([
    old.student_id ? "UPDATE academy_admissions SET version=version WHERE id IN (" : "INSERT INTO academy_student_number_sequence(admission_id)",
    "SELECT a.id FROM academy_admissions a",
    "JOIN academy_batches b ON b.id=a.batch_id",
    "JOIN academy_admission_consents c ON c.admission_id=a.id AND c.identity_revision=a.version",
    "JOIN academy_admission_referrals r ON r.admission_id=a.id",
    "JOIN public_programme_offerings o ON o.id=a.offering_id",
    "WHERE a.id=? AND a.status='REVIEW' AND a.version=? AND a.student_id IS ? AND a.consent_verified=1",
    ...(old.student_id ? ["AND a.existing_student=1 AND EXISTS(SELECT 1 FROM academy_students s WHERE s.id=a.student_id AND s.merged_into_id IS NULL AND s.status<>'ARCHIVED')"] : []),
    "AND b.status='ACTIVE' AND b.offering_id=a.offering_id",
    "AND b.capacity>(SELECT COUNT(*) FROM academy_enrollments en WHERE en.batch_id=b.id AND en.status='ACTIVE')",
    "AND COALESCE((SELECT d.discount_percent FROM academy_admission_discounts d WHERE d.admission_id=a.id),0)=?",
    "AND COALESCE((SELECT SUM(e.amount_paisa) FROM academy_admission_extra_charges e WHERE e.admission_id=a.id AND e.is_active=1),0)=?",
    "AND (?=0 OR EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(o.allowed_discount_percentages_json)",
    "THEN o.allowed_discount_percentages_json ELSE '[]' END) p WHERE p.type IN ('integer','real') AND p.value=?))",
    "AND EXISTS(SELECT 1 FROM academy_fee_plans f WHERE f.id=? AND f.offering_id=a.offering_id AND f.active=1",
    "AND f.monthly_amount_paisa=? AND f.admission_amount_paisa=?",
    "AND f.id=(SELECT current.id FROM academy_fee_plans current WHERE current.offering_id=a.offering_id AND current.active=1 ORDER BY current.rowid DESC LIMIT 1))",
    old.student_id ? ") RETURNING id" : "RETURNING seq"
   ].join(" ")).bind(v.admissionId,old.version,old.student_id,data.discount.selected,extra,data.discount.selected,data.discount.selected,data.plan.id,tuition,admission),
   ...(!old.student_id ? [env.DB.prepare([
    "INSERT INTO academy_students(id,student_no,full_name,class_grade,guardian_name,guardian_mobile,school_name,status)",
    "SELECT ?,'SA-'||printf('%06d',n.seq),a.student_full_name,a.class_grade,a.guardian_full_name,a.guardian_mobile,a.school_name,'INACTIVE'",
    "FROM academy_admissions a JOIN academy_student_number_sequence n ON n.admission_id=a.id",
    "JOIN academy_batches b ON b.id=a.batch_id",
    "JOIN academy_admission_consents c ON c.admission_id=a.id AND c.identity_revision=a.version",
    "JOIN academy_admission_referrals r ON r.admission_id=a.id",
    "WHERE changes()=1 AND a.id=? AND a.status='REVIEW' AND a.version=? AND a.student_id IS NULL AND a.consent_verified=1",
    "AND b.status='ACTIVE' AND b.offering_id=a.offering_id",
    "AND b.capacity>(SELECT COUNT(*) FROM academy_enrollments en WHERE en.batch_id=b.id AND en.status='ACTIVE')",
    "AND EXISTS(SELECT 1 FROM academy_fee_plans f WHERE f.id=? AND f.offering_id=a.offering_id AND f.active=1",
    "AND f.monthly_amount_paisa=? AND f.admission_amount_paisa=?)",
    "RETURNING id"
   ].join(" ")).bind(studentId,v.admissionId,old.version,data.plan.id,tuition,admission)] : []),
   env.DB.prepare([
    "UPDATE academy_admissions SET student_id=?,fee_plan_id=?,status='BILLED',",
    "approved_by=?,verified_by=COALESCE(verified_by,?),version=version+1,",
    "updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",
    "WHERE changes()=1 AND id=? AND version=? AND status='REVIEW' AND EXISTS(SELECT 1 FROM academy_students WHERE id=?) RETURNING id"
   ].join(" ")).bind(studentId,data.plan.id,user,user,v.admissionId,old.version,studentId),
   env.DB.prepare([
    "INSERT INTO academy_admission_bills(id,admission_id,reference,monthly_amount_paisa,admission_amount_paisa,amount_paisa,issue_on,issued_by)",
    "SELECT ?,id,?,?,?,?,date('now'),? FROM academy_admissions",
    "WHERE changes()=1 AND id=? AND status='BILLED' AND student_id=? AND version=? RETURNING id"
   ].join(" ")).bind(billId,reference,monthly,registration,total,user,v.admissionId,studentId,old.version+1),
   env.DB.prepare([
    "INSERT INTO finance_invoices(id,invoice_no,student_id,admission_id,issue_on,due_on,amount_paisa,status,created_by)",
    "SELECT ?,b.reference,?,b.admission_id,b.issue_on,NULL,b.amount_paisa,'ISSUED',?",
    "FROM academy_admission_bills b WHERE changes()=1 AND b.id=? AND b.admission_id=? RETURNING id"
   ].join(" ")).bind(invoiceId,studentId,user,billId,v.admissionId),
   env.DB.prepare([
    "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,after_json)",
    "SELECT ?,'admission',admission_id,'FINALIZED_AND_BILLED',?,?,?",
    "FROM finance_invoices WHERE changes()=1 AND id=? AND student_id=? RETURNING id"
   ].join(" ")).bind(crypto.randomUUID(),user,v.reason,
    JSON.stringify({studentId,invoiceId,reference,studentNo:old.student_id?"Existing permanent identity retained":"SA- sequence allocated atomically",monthlyPaisa:monthly,admissionAndExtrasPaisa:registration,discountPercent:data.discount.selected}),invoiceId,studentId)
  ]);
  if(tx.some(r=>(r.results?.length??0)!==1))return {ok:false,message:"Finalization not confirmed. Check the case and invoice before retrying."};
  refresh(v.admissionId);return {ok:true,message:"Admission confirmed. Student ID and initial invoice issued together; payment remains unpaid until recorded."};
 }catch{return {ok:false,message:"Final submission could not post. Check fee policy, capacity and case state; no payment was recorded."};}
}

const payInput=z.object({admissionId:uuid,requestId:uuid,amount:z.number().positive().max(2000000),
 method:z.enum(["CASH","BANK","MFS"]),reference:z.string().trim().max(160),reason:note});
export async function collectAdmissionPayment(input:unknown):Promise<Outcome>{
 const p=payInput.safeParse(input);if(!p.success)return {ok:false,message:"Check payment method, amount and note."};
 const user=await actor("finance.payments.post");if(!user)return {ok:false,message:"Payment posting permission required."};
 const v=p.data,amount=Math.round(v.amount*100);if(amount<1||!Number.isSafeInteger(amount))return {ok:false,message:"Invalid amount."};
 const replay=await env.DB.prepare("SELECT payment_id FROM academy_admission_collection_keys WHERE request_id=? AND actor_id=?").bind(v.requestId,user).first<{payment_id:string}>();
 if(replay)return {ok:true,message:"Previously saved payment found. No duplicate receipt was created."};
 const invoice=await env.DB.prepare("SELECT id FROM finance_invoices WHERE admission_id=? AND status IN ('ISSUED','PARTIAL') AND amount_paisa-paid_paisa>=? ORDER BY created_at LIMIT 1").bind(v.admissionId,amount).first<{id:string}>();
 if(!invoice)return {ok:false,message:"No matching unpaid invoice or amount exceeds the outstanding balance."};
 const paymentId=crypto.randomUUID(),allocationId=crypto.randomUUID();
 const receiptNo="SA-RCPT-"+crypto.randomUUID().replaceAll("-","").slice(0,12).toUpperCase();
 try{
  const tx=await env.DB.batch([
   env.DB.prepare([
    "INSERT INTO finance_payments(id,receipt_no,student_id,amount_paisa,payment_method,received_by,reference)",
    "SELECT ?,?,i.student_id,?,?,?,? FROM finance_invoices i",
    "WHERE i.id=? AND i.admission_id=? AND i.status IN ('ISSUED','PARTIAL')",
    "AND i.amount_paisa-i.paid_paisa>=? RETURNING id"
   ].join(" ")).bind(paymentId,receiptNo,amount,v.method,user,v.reference||null,invoice.id,v.admissionId,amount),
   env.DB.prepare("INSERT INTO finance_allocations(id,payment_id,invoice_id,amount_paisa) SELECT ?,?,?,? WHERE changes()=1 RETURNING id")
    .bind(allocationId,paymentId,invoice.id,amount),
   env.DB.prepare([
    "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,after_json)",
    "VALUES(?,'finance_payment',(SELECT id FROM finance_payments WHERE id=? AND receipt_no=?),",
    "'RECEIVED_AND_ALLOCATED',?,?,?) RETURNING id"
   ].join(" ")).bind(crypto.randomUUID(),paymentId,receiptNo,user,v.reason,
    JSON.stringify({admissionId:v.admissionId,receiptNo,invoiceId:invoice.id,amountPaisa:amount,method:v.method})),
   env.DB.prepare("INSERT INTO academy_admission_collection_keys(request_id,payment_id,admission_id,actor_id) VALUES(?,?,?,?) RETURNING request_id")
    .bind(v.requestId,paymentId,v.admissionId,user)
  ]);
  if(tx.some(r=>(r.results?.length??0)!==1))return {ok:false,message:"Payment not confirmed. Reload invoice before retrying."};
  refresh(v.admissionId);return {ok:true,message:"Receipt "+receiptNo+" posted and allocated against the invoice."};
 }catch{
  const existing=await env.DB.prepare("SELECT payment_id FROM academy_admission_collection_keys WHERE request_id=? AND actor_id=?").bind(v.requestId,user).first<{payment_id:string}>();
  return existing?{ok:true,message:"Previously posted payment verified."}:{ok:false,message:"Payment not posted. Check invoice and retry the same request."};
 }
}
export async function activateAdmission(input:unknown):Promise<Outcome>{
 const p=finalizeInput.safeParse(input);if(!p.success)return {ok:false,message:"Check enrollment reason."};
 const user=await actor();if(!user)return {ok:false,message:"Admission permission required."};
 const v=p.data,old=await state(v.admissionId);
 if(!old)return {ok:false,message:"Admission not found."};
 if(old.status==="ENROLLED")return {ok:true,message:"Enrollment already active."};
 if(old.status!=="BILLED"||!old.student_id||!old.batch_id)
  return {ok:false,message:"Finalize the application and issue its invoice before enrollment."};
 const enrollmentId=crypto.randomUUID();
 try{
  const tx=await env.DB.batch([
   env.DB.prepare([
    "INSERT INTO academy_enrollments(id,student_id,batch_id,admission_id,status)",
    "SELECT ?,a.student_id,a.batch_id,a.id,'ACTIVE' FROM academy_admissions a",
    "JOIN academy_batches b ON b.id=a.batch_id",
    "JOIN finance_invoices i ON i.admission_id=a.id AND i.student_id=a.student_id",
    "WHERE a.id=? AND a.status='BILLED' AND a.version=? AND b.status='ACTIVE'",
    "AND b.offering_id=a.offering_id AND i.amount_paisa=i.paid_paisa",
    "AND b.capacity>(SELECT COUNT(*) FROM academy_enrollments e WHERE e.batch_id=b.id AND e.status='ACTIVE')",
    "RETURNING id"
   ].join(" ")).bind(enrollmentId,v.admissionId,old.version),
   env.DB.prepare("UPDATE academy_students SET status='ACTIVE' WHERE id=? AND EXISTS(SELECT 1 FROM academy_enrollments WHERE id=?) RETURNING id")
    .bind(old.student_id,enrollmentId),
   env.DB.prepare([
    "UPDATE academy_admissions SET status='ENROLLED',version=version+1,",
    "updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",
    "WHERE id=? AND status='BILLED' AND version=?",
    "AND EXISTS(SELECT 1 FROM academy_enrollments WHERE id=?) RETURNING id"
   ].join(" ")).bind(v.admissionId,old.version,enrollmentId),
   env.DB.prepare([
    "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,after_json)",
    "VALUES(?,'admission',(SELECT admission_id FROM academy_enrollments WHERE id=?),",
    "'ENROLLMENT_ACTIVATED',?,?,?) RETURNING id"
   ].join(" ")).bind(crypto.randomUUID(),enrollmentId,user,v.reason,JSON.stringify({studentId:old.student_id,enrollmentId}))
  ]);
  if(tx.some(r=>(r.results?.length??0)!==1))return {ok:false,message:"Enrollment not confirmed. Check payment and seat availability."};
  refresh(v.admissionId);return {ok:true,message:"Student enrollment activated and recorded in the batch."};
 }catch{return {ok:false,message:"Could not activate. All initial fees must be settled and an active seat available."};}
}

