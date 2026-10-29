import {env} from "cloudflare:workers";
import {getStaffAccess,privateJson,sameOrigin} from "@/lib/staff-access";
import {changeSession} from "@/lib/erp-routine";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
export async function PATCH(request:Request,context:Context){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(!["OWNER","ADMIN"].includes(staff.role))return privateJson({error:"Access denied"},403);
  if(!sameOrigin(request))return privateJson({error:"Invalid request origin"},403);
  const {id}=await context.params;
  if(!/^[0-9a-f-]{36}$/i.test(id))return privateJson({error:"Invalid session ID"},400);
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))return privateJson({error:"JSON required"},415);
  let body:unknown;
  try{const raw=await request.text();if(raw.length>1500)return privateJson({error:"Request too large"},413);body=JSON.parse(raw);}
  catch{return privateJson({error:"Invalid JSON"},400);}
  const parsed=changeSession.safeParse(body);
  if(!parsed.success)return privateJson({error:"Invalid status, version or reason"},400);
  const d=parsed.data;
  try{
    const result=await env.DB.batch([
      env.DB.prepare([
        "UPDATE academy_class_sessions SET status=?,version=version+1,",
        "updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",
        "WHERE id=? AND status='SCHEDULED' AND version=?",
        "AND (?='CANCELLED' OR class_on<=date('now')) RETURNING id"
      ].join(" ")).bind(d.nextStatus,id,d.expectedVersion,d.nextStatus),
      env.DB.prepare([
        "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,after_json)",
        "SELECT ?,'class_session',?,?,?,?,? WHERE changes()=1 RETURNING id"
      ].join(" ")).bind(crypto.randomUUID(),id,d.nextStatus,staff.userId,d.reason,
        JSON.stringify({status:d.nextStatus,version:d.expectedVersion+1})),
    ]);
    if(result.some(x=>(x.results?.length??0)!==1)){
      return privateJson({error:"Session changed or cannot be completed yet"},409);
    }
    return privateJson({ok:true,status:d.nextStatus,version:d.expectedVersion+1});
  }catch{return privateJson({error:"Could not update session"},503);}
}
