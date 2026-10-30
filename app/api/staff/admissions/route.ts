import {env} from "cloudflare:workers";
import {getStaffAccess,privateJson} from "@/lib/staff-access";
import type {AdmissionRow} from "@/lib/erp-admissions";
import {retiredAdmissionMutation} from "@/lib/retired-admission-mutation";
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
        "a.review_note,a.consent_verified,a.prepared_by,a.verified_by,a.approved_by,a.created_at,a.version,",
        "bill.reference AS bill_reference,bill.amount_paisa AS bill_total_paisa",
        "FROM academy_admissions a JOIN public_programme_offerings p ON p.id=a.offering_id",
        "LEFT JOIN academy_batches b ON b.id=a.batch_id",
        "LEFT JOIN academy_fee_plans f ON f.id=a.fee_plan_id",
        "LEFT JOIN academy_admission_bills bill ON bill.admission_id=a.id",
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
  return retiredAdmissionMutation(request);
}
