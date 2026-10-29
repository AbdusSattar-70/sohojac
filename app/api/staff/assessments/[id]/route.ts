import {env} from "cloudflare:workers";
import {getStaffAccess,privateJson,sameOrigin} from "@/lib/staff-access";
import {publishAssessment} from "@/lib/erp-assessments";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
export async function PATCH(request:Request,context:Context){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(!["OWNER","ADMIN"].includes(staff.role))return privateJson({error:"Access denied"},403);
  if(!sameOrigin(request))return privateJson({error:"Invalid request origin"},403);
  const {id}=await context.params;
  if(!/^[0-9a-f-]{36}$/i.test(id))return privateJson({error:"Invalid assessment ID"},400);
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))return privateJson({error:"JSON required"},415);
  let body:unknown;
  try{const raw=await request.text();if(raw.length>1500)return privateJson({error:"Request too large"},413);body=JSON.parse(raw);}
  catch{return privateJson({error:"Invalid JSON"},400);}
  const parsed=publishAssessment.safeParse(body);
  if(!parsed.success)return privateJson({error:"Version and publication reason required"},400);
  const d=parsed.data;
  try{
    const tx=await env.DB.batch([
      env.DB.prepare([
        "UPDATE academy_assessments SET status='PUBLISHED',published_by=?,",
        "published_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),version=version+1",
        "WHERE id=? AND status='DRAFT' AND version=? AND held_on<=date('now')",
        "AND (SELECT COUNT(*) FROM academy_enrollments e WHERE e.batch_id=academy_assessments.batch_id",
        "AND e.status='ACTIVE')>0",
        "AND NOT EXISTS (SELECT 1 FROM academy_enrollments e WHERE",
        "e.batch_id=academy_assessments.batch_id AND e.status='ACTIVE'",
        "AND NOT EXISTS (SELECT 1 FROM academy_assessment_results r",
        "WHERE r.assessment_id=academy_assessments.id AND r.enrollment_id=e.id))",
        "RETURNING id"
      ].join(" ")).bind(staff.userId,id,d.expectedVersion),
      env.DB.prepare([
        "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,after_json)",
        "SELECT ?,'academy_assessment',?,'PUBLISHED',?,?,? WHERE changes()=1 RETURNING id"
      ].join(" ")).bind(crypto.randomUUID(),id,staff.userId,d.reason,
        JSON.stringify({status:"PUBLISHED",version:d.expectedVersion+1})),
    ]);
    if(tx.some(x=>(x.results?.length??0)!==1)){
      return privateJson({error:"Assessment cannot publish until every active student is graded"},409);
    }
    return privateJson({ok:true,status:"PUBLISHED",version:d.expectedVersion+1});
  }catch{return privateJson({error:"Could not publish assessment"},503);}
}
