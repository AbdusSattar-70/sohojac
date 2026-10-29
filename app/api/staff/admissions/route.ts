import {env} from "cloudflare:workers";
import {getStaffAccess,privateJson,sameOrigin} from "@/lib/staff-access";
import {createAdmission,type AdmissionRow} from "@/lib/erp-admissions";
export const dynamic="force-dynamic";
const operations=(role:string)=>["OWNER","ADMIN","OPERATOR"].includes(role);
export async function GET(request:Request){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(!operations(staff.role))return privateJson({error:"Access denied"},403);
  try{
    const [admissions,offerings,batches,feePlans,enquiries]=await Promise.all([
      env.DB.prepare([
        "SELECT a.id,a.application_no,a.enquiry_id,a.offering_id,p.name AS offering_name,",
        "a.status,a.student_full_name,a.class_grade,a.guardian_full_name,a.guardian_mobile,",
        "a.school_name,a.batch_id,b.name AS batch_name,a.fee_plan_id,f.title AS fee_plan_title,",
        "a.review_note,a.consent_verified,a.prepared_by,a.verified_by,a.approved_by,a.created_at,a.version",
        "FROM academy_admissions a JOIN public_programme_offerings p ON p.id=a.offering_id",
        "LEFT JOIN academy_batches b ON b.id=a.batch_id",
        "LEFT JOIN academy_fee_plans f ON f.id=a.fee_plan_id",
        "ORDER BY a.created_at DESC,a.id DESC LIMIT 100"
      ].join(" ")).all<AdmissionRow>(),
      env.DB.prepare("SELECT id,name,is_active FROM public_programme_offerings ORDER BY name LIMIT 150").all<{id:string;name:string;is_active:number}>(),
      env.DB.prepare([
        "SELECT id,name,offering_id,capacity,",
        "(SELECT COUNT(*) FROM academy_enrollments WHERE batch_id=b.id AND status='ACTIVE') AS occupied",
        "FROM academy_batches b WHERE status='ACTIVE' ORDER BY name LIMIT 150"
      ].join(" ")).all<{id:string;name:string;offering_id:string;capacity:number;occupied:number}>(),
      env.DB.prepare("SELECT id,title,offering_id,monthly_amount_paisa,admission_amount_paisa FROM academy_fee_plans WHERE active=1 ORDER BY title LIMIT 150").all<{id:string;title:string;offering_id:string;monthly_amount_paisa:number;admission_amount_paisa:number}>(),
      env.DB.prepare([
        "SELECT e.id,e.reference,e.student_name,e.guardian_name,e.mobile,e.school_name,e.class_name,e.offering_id",
        "FROM public_enquiries e LEFT JOIN academy_admissions a ON a.enquiry_id=e.id",
        "WHERE a.id IS NULL ORDER BY e.submitted_at DESC LIMIT 100"
      ].join(" ")).all<{id:string;reference:string;student_name:string;guardian_name:string;mobile:string;school_name:string|null;class_name:string;offering_id:string|null}>(),
    ]);
    return privateJson({items:admissions.results??[],offerings:offerings.results??[],
      batches:batches.results??[],feePlans:feePlans.results??[],
      enquiries:enquiries.results??[],canApprove:["OWNER","ADMIN"].includes(staff.role)});
  }catch{return privateJson({error:"Admission service unavailable"},503);}
}
export async function POST(request:Request){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(!operations(staff.role))return privateJson({error:"Access denied"},403);
  if(!sameOrigin(request))return privateJson({error:"Invalid request origin"},403);
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")){
    return privateJson({error:"JSON required"},415);
  }
  let body:unknown;
  try{const raw=await request.text();if(raw.length>3000)return privateJson({error:"Request too large"},413);body=JSON.parse(raw);}
  catch{return privateJson({error:"Invalid JSON"},400);}
  const parsed=createAdmission.safeParse(body);
  if(!parsed.success)return privateJson({error:"Check student, guardian, class and reason"},400);
  const data=parsed.data,id=crypto.randomUUID(),applicationNo="SA-APP-"+crypto.randomUUID().replace(/-/g,"").slice(0,12).toUpperCase();
  try{
    const result=await env.DB.batch([
      env.DB.prepare([
        "INSERT INTO academy_admissions",
        "(id,application_no,enquiry_id,offering_id,status,prepared_by,",
        "student_full_name,class_grade,guardian_full_name,guardian_mobile,school_name)",
        "SELECT ?,?,NULLIF(?,''),?,'DRAFT',?,?,?,?,?,?",
        "WHERE EXISTS(SELECT 1 FROM public_programme_offerings WHERE id=?)",
        "AND (?='' OR EXISTS(SELECT 1 FROM public_enquiries",
        "WHERE id=? AND (offering_id IS NULL OR offering_id=?)))"
      ].join(" ")).bind(id,applicationNo,data.enquiryId,data.offeringId,staff.userId,
        data.studentName,data.classGrade,data.guardianName,data.guardianMobile,
        data.schoolName||null,data.offeringId,data.enquiryId,data.enquiryId,data.offeringId),
      env.DB.prepare([
        "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,after_json)",
        "SELECT ?,'admission',?,'DRAFT_CREATED',?,?,? WHERE changes()=1"
      ].join(" ")).bind(crypto.randomUUID(),id,staff.userId,data.reason,
        JSON.stringify({...data,guardianMobile:"[REDACTED]"})),
    ]);
    if(result[0].meta.changes!==1||result[1].meta.changes!==1){
      return privateJson({error:"Programme or enquiry is unavailable"},409);
    }
    return privateJson({ok:true,id,applicationNo,status:"DRAFT"},201);
  }catch{return privateJson({error:"Could not create application; enquiry may already be linked"},409);}
}
