"use server";
import {z} from "zod";
import {env} from "cloudflare:workers";
import {headers} from "next/headers";
import {revalidatePath} from "next/cache";
import {getErpContext} from "@/modules/platform/auth/erp-context";

const schema=z.object({
 prospect_id:z.string().uuid(),
 staff_id:z.union([z.string().uuid(),z.literal("")]),
 reason:z.string().trim().min(5).max(500)
}).strict();
export async function assignProspect(input:unknown){
 const parsed=schema.safeParse(input);
 if(!parsed.success)return {ok:false,message:"Choose a staff member or Unassigned."};
 const context=await getErpContext();
 if(!context?.permissions.includes("crm.prospects.manage"))
  return {ok:false,message:"You are not authorized to assign prospects."};
 const h=await headers(),origin=h.get("origin"),host=h.get("host");
 if(!origin||!host)return {ok:false,message:"Invalid request origin."};
 try{if(new URL(origin).host.toLowerCase()!==host.toLowerCase())
  return {ok:false,message:"Invalid request origin."};}
 catch{return {ok:false,message:"Invalid request origin."};}
 const v=parsed.data,newStaff=v.staff_id||null;
 try{
  const current=await env.DB.prepare(
   "SELECT id,status,version,assigned_to_staff_id FROM academy_prospects WHERE id=?"
  ).bind(v.prospect_id).first<{
   id:string;status:string;version:number;assigned_to_staff_id:string|null
  }>();
  if(!current)return {ok:false,message:"Prospect not found."};
  if(current.status==="CONVERTED")return {ok:false,message:"Converted prospect cannot be reassigned."};
  if(newStaff){
   const staff=await env.DB.prepare(
    "SELECT id FROM academy_staff WHERE id=? AND status IN ('ACTIVE','ON_LEAVE')"
   ).bind(newStaff).first();
   if(!staff)return {ok:false,message:"Choose an active or on-leave staff member."};
  }
  const result=await env.DB.batch([
   env.DB.prepare(
    "UPDATE academy_prospects SET assigned_to_staff_id=?,version=version+1,"+
    "updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND version=?"
   ).bind(newStaff,v.prospect_id,current.version),
   env.DB.prepare(
    "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,before_json,after_json) "+
    "SELECT ?,'prospect',?,'ASSIGNED',?,?,?,? WHERE changes()=1"
   ).bind(crypto.randomUUID(),v.prospect_id,context.profileId,v.reason,
    JSON.stringify({staffId:current.assigned_to_staff_id}),
    JSON.stringify({staffId:newStaff}))
  ]);
  if(result.some(x=>x.meta?.changes!==1))
   return {ok:false,message:"Prospect assignment changed. Refresh and retry."};
  revalidatePath("/dashboard/crm/prospects");
  revalidatePath("/dashboard/crm/prospects/"+v.prospect_id);
  revalidatePath("/dashboard/governance/audit");
  return {ok:true,message:"Follow-up responsibility saved. Referral compensation is managed separately on the admission case."};
 }catch{return {ok:false,message:"Could not save prospect assignment."};}
}
