"use server";
import {z} from "zod";
import {env} from "cloudflare:workers";
import {headers} from "next/headers";
import {revalidatePath} from "next/cache";
import {getErpContext} from "@/modules/platform/auth/erp-context";
const schema=z.object({entity:z.literal("offering"),id:z.string().min(2).max(100).regex(/^[A-Za-z0-9-]+$/),active:z.boolean(),reason:z.string().trim().min(5).max(500)});
export async function changeRecordState(input:unknown){
 const p=schema.safeParse(input);if(!p.success)return {ok:false,message:"Check the offering and change reason."};
 const context=await getErpContext();if(!context?.permissions.includes("academics.manage"))return {ok:false,message:"Offering management permission required."};
 const h=await headers();try{if(!h.get("origin")||!h.get("host")||new URL(h.get("origin")!).host.toLowerCase()!==h.get("host")!.toLowerCase())return {ok:false,message:"Invalid request origin."};}catch{return {ok:false,message:"Invalid request origin."};}
 const v=p.data;
 const old=await env.DB.prepare("SELECT id,version,offering_status,is_active FROM public_programme_offerings WHERE id=?").bind(v.id).first<{id:string;version:number;offering_status:string|null;is_active:number}>();
 if(!old)return {ok:false,message:"Offering not found."};
 const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Dhaka",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 try{
  const tx=await env.DB.batch([
   env.DB.prepare("UPDATE public_programme_offerings SET offering_status=?,is_active=?,show_on_website=CASE WHEN ?=0 THEN 0 ELSE show_on_website END,is_accepting_applications=CASE WHEN ?=0 THEN 0 ELSE is_accepting_applications END,application_state=CASE WHEN ?=0 THEN 'CLOSED' ELSE application_state END,version=version+1,source_updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND version=? AND (?=0 OR EXISTS(SELECT 1 FROM academy_fee_plans f WHERE f.offering_id=public_programme_offerings.id AND f.active=1 AND (f.source_version IS NULL OR (f.source_status='ACTIVE' AND f.effective_from<=? AND (f.effective_to IS NULL OR f.effective_to>=?))))) RETURNING id").bind(v.active?"ACTIVE":"RETIRED",v.active?1:0,v.active?1:0,v.active?1:0,v.active?1:0,v.id,old.version,v.active?1:0,today,today),
   env.DB.prepare("INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,before_json,after_json) SELECT ?,'programme_offering',?,?,?, ?,?,? WHERE changes()=1 RETURNING id").bind(crypto.randomUUID(),v.id,v.active?"REACTIVATE":"MARK_INACTIVE",context.profileId,v.reason,JSON.stringify(old),JSON.stringify({status:v.active?"ACTIVE":"RETIRED"}))
  ]);
  if(tx.some(r=>r.results?.length!==1))return {ok:false,message:"Offering changed or has no effective fee plan. Refresh before retrying."};
  for(const path of ["/dashboard/academics/offerings","/dashboard/crm/manage","/dashboard/admissions","/","/interest"])revalidatePath(path);
  return {ok:true,message:v.active?"Offering reactivated.":"Offering retired. Historical placements remain available."};
 }catch{return {ok:false,message:"Offering lifecycle change could not be confirmed."};}
}
