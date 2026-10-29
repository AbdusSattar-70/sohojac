"use server";

import {env} from "cloudflare:workers";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {getErpContext} from "@/modules/platform/auth/erp-context";

/** Source inline school/relationship chooser with D1 authorization and audit. */
const schema=z.object({
 entity:z.enum(["school","relationship"]),
 name:z.string().trim().min(2).max(160),
});
export async function createAdmissionDirectoryChoice(input:unknown) {
 const parsed=schema.safeParse(input);
 if(!parsed.success)return {ok:false as const,message:"Enter a valid school or relationship."};
 const context=await getErpContext();
 if(!context?.permissions.includes("admissions.create"))
  return {ok:false as const,message:"Admission permission required."};
 const v=parsed.data;
 const table=v.entity==="school"?"academy_schools":"academy_guardian_relationships";
 try{
  const old=await env.DB.prepare("SELECT id,name FROM "+table+
   " WHERE lower(trim(name))=lower(trim(?)) ORDER BY id LIMIT 1").bind(v.name)
   .first<{id:string;name:string}>();
  if(old)return {ok:true as const,row:old};
  const id=crypto.randomUUID(),auditId=crypto.randomUUID();
  const code="AD-"+id.slice(0,16).toUpperCase();
  const insert=v.entity==="school"
   ?env.DB.prepare("INSERT INTO academy_schools(id,name,is_active,is_verified) VALUES(?,?,1,0)").bind(id,v.name)
   :env.DB.prepare("INSERT INTO academy_guardian_relationships(id,code,name,is_active) VALUES(?,?,?,1)").bind(id,code,v.name);
  const result=await env.DB.batch([
   insert,
   env.DB.prepare("INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,after_json) VALUES(?,?,?,?,?,?,?)")
    .bind(auditId,v.entity==="school"?"school":"guardian_relationship",id,"DIRECTORY_CREATE",
     context.profileId,"Created while verifying an admission application",JSON.stringify({name:v.name}))
  ]);
  if(result[0].meta.changes!==1||result[1].meta.changes!==1)
   return {ok:false as const,message:"Directory update unconfirmed."};
  revalidatePath("/dashboard/admissions");
  return {ok:true as const,row:{id,name:v.name}};
 }catch{
  return {ok:false as const,message:"Directory update failed. Check existing choices before retrying."};
 }
}
