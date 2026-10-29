import {env} from "cloudflare:workers";
import {getStaffAccess,privateJson,sameOrigin} from "@/lib/staff-access";
import {teacherAssignmentPatch} from "@/lib/erp-teachers";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
export async function PATCH(request:Request,context:Context){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(!["OWNER","ADMIN"].includes(staff.role))return privateJson({error:"Access denied"},403);
  if(!sameOrigin(request))return privateJson({error:"Invalid request origin"},403);
  const {id}=await context.params;
  if(!/^[0-9a-f-]{36}$/i.test(id))return privateJson({error:"Invalid assignment"},400);
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))return privateJson({error:"JSON required"},415);
  let body:unknown;
  try{const raw=await request.text();if(raw.length>1500)return privateJson({error:"Request too large"},413);body=JSON.parse(raw);}
  catch{return privateJson({error:"Invalid JSON"},400);}
  const parsed=teacherAssignmentPatch.safeParse(body);
  if(!parsed.success)return privateJson({error:"Invalid assignment change"},400);
  const d=parsed.data;
  try{
    const tx=await env.DB.batch([
      env.DB.prepare([
        "UPDATE academy_batch_teachers SET active=?,version=version+1,",
        "updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",
        "WHERE id=? AND version=? AND active!=?",
        "AND (?=0 OR (EXISTS(SELECT 1 FROM staff_memberships m",
        "WHERE m.user_id=academy_batch_teachers.teacher_user_id AND m.role='TEACHER' AND m.active=1)",
        "AND EXISTS(SELECT 1 FROM academy_batches b",
        "WHERE b.id=academy_batch_teachers.batch_id AND b.status='ACTIVE')))",
        "RETURNING id"
      ].join(" ")).bind(d.active?1:0,id,d.expectedVersion,d.active?1:0,d.active?1:0),
      env.DB.prepare([
        "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,after_json)",
        "SELECT ?,'teacher_assignment',?,?,?,?,? WHERE changes()=1 RETURNING id"
      ].join(" ")).bind(crypto.randomUUID(),id,d.active?"REACTIVATED":"REVOKED",
        staff.userId,d.reason,JSON.stringify({active:d.active,version:d.expectedVersion+1})),
    ]);
    if(tx.some(x=>(x.results?.length??0)!==1)){
      return privateJson({error:"Assignment changed or staff membership is inactive"},409);
    }
    return privateJson({ok:true,active:d.active,version:d.expectedVersion+1});
  }catch{return privateJson({error:"Could not update assignment"},503);}
}
