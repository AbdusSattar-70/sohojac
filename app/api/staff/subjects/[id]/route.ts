import {env} from "cloudflare:workers";
import {getStaffAccess,privateJson,sameOrigin} from "@/lib/staff-access";
import {modifySubject} from "@/lib/erp-subjects";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
export async function PATCH(request:Request,context:Context){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(!["OWNER","ADMIN"].includes(staff.role))return privateJson({error:"Access denied"},403);
  if(!sameOrigin(request))return privateJson({error:"Invalid request origin"},403);
  const {id}=await context.params;
  if(id.length<2||id.length>100)return privateJson({error:"Invalid subject ID"},400);
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))return privateJson({error:"JSON required"},415);
  let body:unknown;
  try{const raw=await request.text();if(raw.length>1500)return privateJson({error:"Request too large"},413);body=JSON.parse(raw);}
  catch{return privateJson({error:"Invalid JSON"},400);}
  const parsed=modifySubject.safeParse(body);
  if(!parsed.success)return privateJson({error:"Invalid subject change"},400);
  const d=parsed.data;
  try{
    const tx=await env.DB.batch([
      env.DB.prepare([
        "UPDATE academy_subjects SET name=?,active=?,version=version+1",
        "WHERE id=? AND version=? RETURNING id"
      ].join(" ")).bind(d.name,d.active?1:0,id,d.expectedVersion),
      env.DB.prepare([
        "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,after_json)",
        "SELECT ?,'academy_subject',?,'UPDATED',?,?,? WHERE changes()=1 RETURNING id"
      ].join(" ")).bind(crypto.randomUUID(),id,staff.userId,d.reason,
        JSON.stringify({name:d.name,active:d.active,version:d.expectedVersion+1})),
    ]);
    if(tx.some(x=>(x.results?.length??0)!==1))return privateJson({error:"Subject changed; refresh"},409);
    return privateJson({ok:true,version:d.expectedVersion+1});
  }catch{return privateJson({error:"Could not update subject"},409);}
}
