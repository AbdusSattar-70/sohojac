import {env} from "cloudflare:workers";
import {z} from "zod";
import {getStaffAccess,privateJson,sameOrigin} from "@/lib/staff-access";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
const input=z.object({
  expectedVersion:z.number().int().min(1),
  reason:z.string().trim().min(8).max(500),
}).strict();
export async function POST(request:Request,context:Context){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(!["OWNER","ADMIN","OPERATOR"].includes(staff.role))return privateJson({error:"Access denied"},403);
  if(!sameOrigin(request))return privateJson({error:"Invalid request origin"},403);
  const {id}=await context.params;
  if(!/^[0-9a-f-]{36}$/i.test(id))return privateJson({error:"Invalid application ID"},400);
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))return privateJson({error:"JSON required"},415);
  let body:unknown;
  try{const raw=await request.text();if(raw.length>1500)return privateJson({error:"Request too large"},413);body=JSON.parse(raw);}
  catch{return privateJson({error:"Invalid JSON"},400);}
  const parsed=input.safeParse(body);
  if(!parsed.success)return privateJson({error:"Missing version or enrollment reason"},400);
  const data=parsed.data;
  const studentId=crypto.randomUUID(),enrollmentId=crypto.randomUUID(),invoiceId=crypto.randomUUID();
  const studentNo="SA-STD-"+crypto.randomUUID().replace(/-/g,"").slice(0,12).toUpperCase();
  try{
    // D1 batch runs sequentially in ONE database transaction. A constraint
    // failure at any step rolls back the entire student/enrollment/invoice set.
    const tx=await env.DB.batch([
      env.DB.prepare([
        "INSERT INTO academy_students",
        "(id,student_no,full_name,class_grade,guardian_name,guardian_mobile,school_name,status)",
        "SELECT ?,?,a.student_full_name,a.class_grade,a.guardian_full_name,",
        "a.guardian_mobile,a.school_name,'ACTIVE' FROM academy_admissions a",
        "JOIN academy_admission_bills bill ON bill.admission_id=a.id",
        "JOIN academy_batches b ON b.id=a.batch_id",
        "WHERE a.id=? AND a.status='BILLED' AND a.version=? AND a.student_id IS NULL",
        "AND a.consent_verified=1 AND b.status='ACTIVE' AND b.offering_id=a.offering_id",
        "AND b.capacity>(SELECT COUNT(*) FROM academy_enrollments e",
        "WHERE e.batch_id=b.id AND e.status='ACTIVE')",
        "AND EXISTS(SELECT 1 FROM public_programme_offerings p",
        "WHERE p.id=a.offering_id AND p.is_active=1)"
      ].join(" ")).bind(studentId,studentNo,id,data.expectedVersion),
      env.DB.prepare([
        "INSERT INTO academy_enrollments(id,student_id,batch_id,admission_id,status)",
        "SELECT ?,?,a.batch_id,a.id,'ACTIVE' FROM academy_admissions a",
        "WHERE a.id=? AND a.status='BILLED' AND a.version=? AND changes()=1"
      ].join(" ")).bind(enrollmentId,studentId,id,data.expectedVersion),
      env.DB.prepare([
        "INSERT INTO finance_invoices",
        "(id,invoice_no,student_id,admission_id,issue_on,due_on,amount_paisa,status,created_by)",
        "SELECT ?,bill.reference,?,a.id,bill.issue_on,NULL,bill.amount_paisa,'ISSUED',?",
        "FROM academy_admissions a JOIN academy_admission_bills bill ON bill.admission_id=a.id",
        "WHERE a.id=? AND a.status='BILLED' AND a.version=? AND changes()=1"
      ].join(" ")).bind(invoiceId,studentId,staff.userId,id,data.expectedVersion),
      env.DB.prepare([
        "UPDATE academy_admissions SET student_id=?,status='ENROLLED',version=version+1,",
        "updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",
        "WHERE id=? AND status='BILLED' AND version=? AND changes()=1"
      ].join(" ")).bind(studentId,id,data.expectedVersion),
      env.DB.prepare([
        "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,after_json)",
        "SELECT ?,'admission',?,'ENROLLED',?,?,? WHERE changes()=1"
      ].join(" ")).bind(crypto.randomUUID(),id,staff.userId,data.reason,
        JSON.stringify({studentId,studentNo,enrollmentId,invoiceId})),
    ]);
    if(tx.some(x=>x.meta.changes!==1)){
      return privateJson({error:"Enrollment rejected: already processed, full or inactive batch"},409);
    }
    return privateJson({ok:true,status:"ENROLLED",studentId,studentNo,invoiceId,version:data.expectedVersion+1},201);
  }catch{
    return privateJson({error:"Enrollment failed. The transaction was rolled back; refresh and verify capacity."},409);
  }
}
