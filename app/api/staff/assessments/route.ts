import {env} from "cloudflare:workers";
import {getStaffAccess,privateJson,sameOrigin} from "@/lib/staff-access";
import {newAssessment,type AssessmentRow,type ExamEnrollment,type ExamResult} from "@/lib/erp-assessments";
export const dynamic="force-dynamic";
const canRead=(r:string)=>["OWNER","ADMIN","OPERATOR"].includes(r);
export async function GET(request:Request){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(!canRead(staff.role))return privateJson({error:"Access denied"},403);
  try{
    const [assessments,batches,enrollments,results]=await Promise.all([
      env.DB.prepare([
        "SELECT a.id,a.batch_id,b.name AS batch_name,a.title,a.subject,",
        "a.held_on,a.max_marks,a.status,a.version",
        "FROM academy_assessments a JOIN academy_batches b ON b.id=a.batch_id",
        "ORDER BY a.held_on DESC,a.created_at DESC LIMIT 100"
      ].join(" ")).all<AssessmentRow>(),
      env.DB.prepare("SELECT id,name FROM academy_batches WHERE status='ACTIVE' ORDER BY name LIMIT 150").all<{id:string;name:string}>(),
      env.DB.prepare([
        "SELECT e.id AS enrollment_id,e.batch_id,s.student_no,s.full_name AS student_name",
        "FROM academy_enrollments e JOIN academy_students s ON s.id=e.student_id",
        "WHERE e.status='ACTIVE' ORDER BY e.batch_id,s.student_no LIMIT 500"
      ].join(" ")).all<ExamEnrollment>(),
      env.DB.prepare([
        "SELECT r.id,r.assessment_id,r.enrollment_id,r.obtained_marks,r.version,r.note",
        "FROM academy_assessment_results r JOIN academy_assessments a ON a.id=r.assessment_id",
        "ORDER BY r.graded_at DESC LIMIT 2000"
      ].join(" ")).all<ExamResult>(),
    ]);
    return privateJson({items:assessments.results??[],batches:batches.results??[],
      enrollments:enrollments.results??[],results:results.results??[],
      canPublish:["OWNER","ADMIN"].includes(staff.role)});
  }catch{return privateJson({error:"Assessment register unavailable"},503);}
}
export async function POST(request:Request){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(!["OWNER","ADMIN"].includes(staff.role))return privateJson({error:"Access denied"},403);
  if(!sameOrigin(request))return privateJson({error:"Invalid request origin"},403);
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")){
    return privateJson({error:"JSON required"},415);
  }
  let body:unknown;
  try{const raw=await request.text();if(raw.length>2500)return privateJson({error:"Request too large"},413);body=JSON.parse(raw);}
  catch{return privateJson({error:"Invalid JSON"},400);}
  const parsed=newAssessment.safeParse(body);
  if(!parsed.success)return privateJson({error:"Check assessment and total marks"},400);
  const d=parsed.data,id=crypto.randomUUID();
  try{
    const tx=await env.DB.batch([
      env.DB.prepare([
        "INSERT INTO academy_assessments(id,batch_id,title,subject,held_on,max_marks,created_by)",
        "SELECT ?,b.id,?,?,?,?,? FROM academy_batches b",
        "WHERE b.id=? AND b.status='ACTIVE'",
        "AND ? BETWEEN date('now','-30 days') AND date('now','+365 days')",
        "RETURNING id"
      ].join(" ")).bind(id,d.title,d.subject,d.heldOn,d.maxMarks,staff.userId,d.batchId,d.heldOn),
      env.DB.prepare([
        "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,after_json)",
        "SELECT ?,'academy_assessment',?,'CREATED',?,?,? WHERE changes()=1 RETURNING id"
      ].join(" ")).bind(crypto.randomUUID(),id,staff.userId,d.reason,
        JSON.stringify({title:d.title,subject:d.subject,maxMarks:d.maxMarks,heldOn:d.heldOn})),
    ]);
    if(tx.some(x=>(x.results?.length??0)!==1))return privateJson({error:"Batch or assessment date unavailable"},409);
    return privateJson({ok:true,id,version:1,status:"DRAFT"},201);
  }catch{return privateJson({error:"Assessment duplicates an existing test or conflicts with its batch"},409);}
}
