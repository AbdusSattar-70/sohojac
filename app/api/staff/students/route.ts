import {env} from "cloudflare:workers";
import {getStaffAccess,privateJson} from "@/lib/staff-access";
export const dynamic="force-dynamic";
type StudentRow={
  id:string;student_no:string;full_name:string;class_grade:number;
  guardian_name:string;guardian_mobile:string;school_name:string|null;
  status:string;created_at:string;batch_name:string|null;offering_name:string|null;
  invoice_no:string|null;invoice_amount_paisa:number|null;invoice_paid_paisa:number|null;
};
export async function GET(request:Request){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  // Teachers require assignment-scoped views in a later classroom module.
  if(!["OWNER","ADMIN","OPERATOR"].includes(staff.role))return privateJson({error:"Access denied"},403);
  try{
    const students=await env.DB.prepare([
      "SELECT s.id,s.student_no,s.full_name,s.class_grade,s.guardian_name,",
      "s.guardian_mobile,s.school_name,s.status,s.created_at,",
      "b.name AS batch_name,p.name AS offering_name,",
      "i.invoice_no,i.amount_paisa AS invoice_amount_paisa,i.paid_paisa AS invoice_paid_paisa",
      "FROM academy_students s",
      "LEFT JOIN academy_enrollments e ON e.student_id=s.id AND e.status='ACTIVE'",
      "LEFT JOIN academy_batches b ON b.id=e.batch_id",
      "LEFT JOIN public_programme_offerings p ON p.id=b.offering_id",
      "LEFT JOIN finance_invoices i ON i.admission_id=e.admission_id",
      "ORDER BY s.created_at DESC,s.id DESC LIMIT 200"
    ].join(" ")).all<StudentRow>();
    return privateJson({items:students.results??[]});
  }catch{return privateJson({error:"Student register unavailable"},503);}
}
