"use server";
import { changeStudentRecordState } from "@/modules/students/lifecycle/state-actions";
import {z} from "zod";
import {env} from "cloudflare:workers";
import {headers} from "next/headers";
import {revalidatePath} from "next/cache";
import {getErpContext} from "@/modules/platform/auth/erp-context";

const schema=z.object({
 entity:z.enum(["batch","offering","student","staff","referrer"]),
 id:z.string().uuid(),active:z.boolean(),reason:z.string().trim().min(5).max(500)
});
export async function changeRecordState(input:unknown){
 const parsed=schema.safeParse(input);
 if(!parsed.success)return {ok:false,message:"Check the record and change reason."};
 const value=parsed.data;
 if(value.entity==="student") return changeStudentRecordState(value);
 // Do not imply that unported lifecycle workflows work.
 if(value.entity!=="staff")
  return {ok:false,message:"This record's original lifecycle workflow has not yet migrated."};
 const context=await getErpContext();
 if(!context?.permissions.includes("staff.manage"))
  return {ok:false,message:"You are not authorized to manage staff lifecycle."};
 const h=await headers(),origin=h.get("origin"),host=h.get("host");
 if(!origin||!host)return {ok:false,message:"Invalid request origin."};
 try{if(new URL(origin).host.toLowerCase()!==host.toLowerCase())
   return {ok:false,message:"Invalid request origin."};}
 catch{return {ok:false,message:"Invalid request origin."};}
 try{
  const row=await env.DB.prepare(
   "SELECT id,linked_user_id,status,version,full_name,staff_no FROM academy_staff WHERE id=?"
  ).bind(value.id).first<{
   id:string;linked_user_id:string|null;status:string;version:number;
   full_name:string;staff_no:string;
  }>();
  if(!row)return {ok:false,message:"Staff record unavailable."};
  const isArchived=row.status==="ARCHIVED";
  if(isArchived===!value.active)
   return {ok:false,message:"Record state changed; refresh before retrying."};
  if(!value.active && row.linked_user_id===context.profileId)
   return {ok:false,message:"You cannot archive your own authenticated staff identity."};
  const targetStatus=value.active?"ACTIVE":"ARCHIVED";
  const result=await env.DB.batch([
   env.DB.prepare(
    "UPDATE academy_staff SET status=?,version=version+1,"+
    "updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "+
    "WHERE id=? AND version=? AND status=?"
   ).bind(targetStatus,value.id,row.version,row.status),
   env.DB.prepare(
    "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,before_json,after_json) "+
    "SELECT ?,'staff',?,?,?, ?,?,? WHERE changes()=1"
   ).bind(crypto.randomUUID(),value.id,value.active?"REACTIVATED":"ARCHIVED",
     context.profileId,value.reason,JSON.stringify(row),
     JSON.stringify({status:targetStatus,staffNo:row.staff_no}))
  ]);
  if(result[0].meta.changes!==1||result[1].meta.changes!==1)
   return {ok:false,message:"Staff record changed; refresh before retrying."};
  revalidatePath("/dashboard/staff");
  revalidatePath("/app/staff-directory");
  return {ok:true,message:value.active?"Record reactivated.":"Record marked inactive. History retained."};
 }catch{return {ok:false,message:"Unable to change staff lifecycle; refresh before retrying."};}
}
