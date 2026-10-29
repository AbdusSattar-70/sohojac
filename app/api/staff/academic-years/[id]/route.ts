import {env} from "cloudflare:workers";
import {getStaffAccess,privateJson,sameOrigin} from "@/lib/staff-access";
import {yearPatch,type AcademicYearRow} from "@/lib/academic-years";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};

export async function PATCH(request:Request,context:Context){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(!["OWNER","ADMIN"].includes(staff.role))return privateJson({error:"Access denied"},403);
  if(!sameOrigin(request))return privateJson({error:"Invalid request origin"},403);
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")){
    return privateJson({error:"JSON required"},415);
  }
  const {id}=await context.params;
  if(!/^[0-9a-f-]{36}$/i.test(id))return privateJson({error:"Invalid year ID"},400);
  let body:unknown;
  try{
    const raw=await request.text();
    if(raw.length>2500)return privateJson({error:"Request too large"},413);
    body=JSON.parse(raw);
  }catch{return privateJson({error:"Invalid JSON"},400);}
  const parsed=yearPatch.safeParse(body);
  if(!parsed.success)return privateJson({error:"Check the year details and update reason"},400);
  try{
    const old=await env.DB.prepare(`SELECT id,code,title,starts_on,ends_on,status,version
      FROM academic_years WHERE id=?`).bind(id).first<AcademicYearRow>();
    if(!old)return privateJson({error:"Academic year not found"},404);
    if(old.version!==parsed.data.expectedVersion)return privateJson({error:"Year changed. Refresh first."},409);
    if(old.status==="CLOSED" ||
      (old.status==="DRAFT" && parsed.data.nextStatus==="CLOSED") ||
      (old.status==="ACTIVE" && parsed.data.nextStatus==="DRAFT")){
      return privateJson({error:"Invalid year status transition"},409);
    }
    const updated={
      title:parsed.data.title,
      starts_on:parsed.data.startsOn||null,
      ends_on:parsed.data.endsOn||null,
      status:parsed.data.nextStatus,
      version:old.version+1,
    };
    const result=await env.DB.batch([
      env.DB.prepare(`UPDATE academic_years
        SET title=?,starts_on=?,ends_on=?,status=?,version=version+1
        WHERE id=? AND status=? AND version=?`)
        .bind(updated.title,updated.starts_on,updated.ends_on,
          updated.status,id,old.status,old.version),
      env.DB.prepare(`INSERT INTO erp_audit_events
        (id,entity_type,entity_id,action,actor_id,reason,before_json,after_json)
        SELECT ?,'academic_year',?,'UPDATED',?,?,?,? WHERE changes()=1`)
        .bind(crypto.randomUUID(),id,staff.userId,parsed.data.reason,
          JSON.stringify(old),JSON.stringify(updated)),
    ]);
    if(result[0].meta.changes!==1||result[1].meta.changes!==1){
      return privateJson({error:"Year changed. Refresh first."},409);
    }
    return privateJson({ok:true,version:updated.version,status:updated.status});
  }catch{return privateJson({error:"Could not save. Only one academic year may be active at once."},409);}
}
