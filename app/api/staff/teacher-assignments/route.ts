import {env} from "cloudflare:workers";
import {getStaffAccess,privateJson,sameOrigin} from "@/lib/staff-access";
import {teacherAssign,type TeacherAssignment} from "@/lib/erp-teachers";
export const dynamic="force-dynamic";
const authorized=(r:string)=>r==="OWNER"||r==="ADMIN";
export async function GET(request:Request){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(!authorized(staff.role))return privateJson({error:"Access denied"},403);
  try{
    const [teachers,batches,assignments]=await Promise.all([
      env.DB.prepare([
        "SELECT m.user_id,u.name,u.email FROM staff_memberships m",
        "JOIN \"user\" u ON u.id=m.user_id",
        "WHERE m.active=1 AND m.role='TEACHER' ORDER BY u.name LIMIT 200"
      ].join(" ")).all<{user_id:string;name:string;email:string}>(),
      env.DB.prepare("SELECT id,name FROM academy_batches WHERE status='ACTIVE' ORDER BY name LIMIT 150")
        .all<{id:string;name:string}>(),
      env.DB.prepare([
        "SELECT a.id,a.batch_id,b.name AS batch_name,a.teacher_user_id,",
        "u.name AS teacher_name,u.email AS teacher_email,a.active,a.version,a.created_at",
        "FROM academy_batch_teachers a JOIN academy_batches b ON b.id=a.batch_id",
        "JOIN \"user\" u ON u.id=a.teacher_user_id",
        "ORDER BY a.active DESC,b.name,u.name LIMIT 300"
      ].join(" ")).all<TeacherAssignment>(),
    ]);
    return privateJson({teachers:teachers.results??[],batches:batches.results??[],
      assignments:assignments.results??[]});
  }catch{return privateJson({error:"Teacher assignment unavailable"},503);}
}
export async function POST(request:Request){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(!authorized(staff.role))return privateJson({error:"Access denied"},403);
  if(!sameOrigin(request))return privateJson({error:"Invalid request origin"},403);
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")){
    return privateJson({error:"JSON required"},415);
  }
  let body:unknown;
  try{const raw=await request.text();if(raw.length>2000)return privateJson({error:"Request too large"},413);body=JSON.parse(raw);}
  catch{return privateJson({error:"Invalid JSON"},400);}
  const parsed=teacherAssign.safeParse(body);
  if(!parsed.success)return privateJson({error:"Invalid teacher, batch or reason"},400);
  const d=parsed.data,id=crypto.randomUUID();
  try{
    const tx=await env.DB.batch([
      env.DB.prepare([
        "INSERT INTO academy_batch_teachers(id,batch_id,teacher_user_id,assigned_by)",
        "SELECT ?,b.id,m.user_id,? FROM academy_batches b",
        "JOIN staff_memberships m ON m.user_id=? AND m.active=1 AND m.role='TEACHER'",
        "WHERE b.id=? AND b.status='ACTIVE' RETURNING id"
      ].join(" ")).bind(id,staff.userId,d.teacherUserId,d.batchId),
      env.DB.prepare([
        "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,after_json)",
        "SELECT ?,'teacher_assignment',?,'ASSIGNED',?,?,? WHERE changes()=1 RETURNING id"
      ].join(" ")).bind(crypto.randomUUID(),id,staff.userId,d.reason,
        JSON.stringify({teacherUserId:d.teacherUserId,batchId:d.batchId})),
    ]);
    if(tx.some(x=>(x.results?.length??0)!==1)){
      return privateJson({error:"Teacher or batch is inactive"},409);
    }
    return privateJson({ok:true,id,version:1},201);
  }catch{return privateJson({error:"Teacher already has this batch assignment"},409);}
}
