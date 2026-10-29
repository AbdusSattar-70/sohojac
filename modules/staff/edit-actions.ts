"use server";
import {z} from "zod";
import {env} from "cloudflare:workers";
import {headers} from "next/headers";
import {revalidatePath} from "next/cache";
import {getErpContext} from "@/modules/platform/auth/erp-context";

const mobile=z.string().regex(/^$|^01[3-9][0-9]{8}$/);
const schema=z.object({
 id:z.string().uuid(),
 expectedVersion:z.coerce.number().int().positive(),
 full_name:z.string().trim().min(2).max(160),
 mobile,alternate_mobile:mobile.optional(),
 email:z.union([z.email(),z.literal("")]).optional(),
 address:z.string().max(500).optional(),
 emergency_contact_name:z.string().max(160).optional(),
 emergency_contact_mobile:mobile.optional(),
 joined_on:z.union([z.iso.date(),z.literal("")]).optional(),
 notes:z.string().max(1000).optional(),
 reason:z.string().trim().min(5).max(500)
}).strict();

export async function editStaffRecord(input:unknown){
 const parsed=schema.safeParse(input);
 if(!parsed.success)return {ok:false,message:"Enter valid staff details."};
 const context=await getErpContext();
 if(!context?.permissions.includes("staff.manage"))
  return {ok:false,message:"You are not authorized to change staff records."};
 const h=await headers(),origin=h.get("origin"),host=h.get("host");
 if(!origin||!host)return {ok:false,message:"Invalid request origin."};
 try{if(new URL(origin).host.toLowerCase()!==host.toLowerCase())
   return {ok:false,message:"Invalid request origin."};}
 catch{return {ok:false,message:"Invalid request origin."};}
 const v=parsed.data;
 try{
  const row=await env.DB.prepare(
   "SELECT id,linked_user_id,version,status,full_name,mobile,alternate_mobile,"+
   "email,address,emergency_contact_name,emergency_contact_mobile,joined_on,notes "+
   "FROM academy_staff WHERE id=?"
  ).bind(v.id).first<{
   linked_user_id:string|null;version:number;status:string;[key:string]:unknown;
  }>();
  if(!row)return {ok:false,message:"Staff record unavailable. Refresh before retrying."};
  if(row.version!==v.expectedVersion)return {ok:false,message:"Staff record changed; reload before editing."};
  if(row.status==="ARCHIVED")return {ok:false,message:"Archived staff details cannot be edited before reactivation."};
  // Source contract: linked login emails are immutable through the staff form.
  if(row.linked_user_id && v.email!==undefined && v.email!==row.email)
   return {ok:false,message:"Linked account email must be changed in secure account settings."};
  const changes={
   full_name:v.full_name,mobile:v.mobile||null,alternate_mobile:v.alternate_mobile||null,
   email:row.linked_user_id?row.email:(v.email||null),
   address:v.address||null,emergency_contact_name:v.emergency_contact_name||null,
   emergency_contact_mobile:v.emergency_contact_mobile||null,
   joined_on:v.joined_on||null,notes:v.notes||null
  };
  const batch=await env.DB.batch([
   env.DB.prepare(
    "UPDATE academy_staff SET full_name=?,mobile=?,alternate_mobile=?,email=?,"+
    "address=?,emergency_contact_name=?,emergency_contact_mobile=?,joined_on=?,"+
    "notes=?,version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') "+
    "WHERE id=? AND version=? AND status!='ARCHIVED'"
   ).bind(changes.full_name,changes.mobile,changes.alternate_mobile,changes.email,
    changes.address,changes.emergency_contact_name,changes.emergency_contact_mobile,
    changes.joined_on,changes.notes,v.id,v.expectedVersion),
   env.DB.prepare(
    "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,before_json,after_json) "+
    "SELECT ?,'staff',?,'UPDATED',?,?,?,? WHERE changes()=1"
   ).bind(crypto.randomUUID(),v.id,context.profileId,v.reason,JSON.stringify(row),JSON.stringify(changes))
  ]);
  if(batch[0].meta.changes!==1||batch[1].meta.changes!==1)
   return {ok:false,message:"Staff details changed; refresh before retrying."};
  revalidatePath("/dashboard/staff");
  revalidatePath("/app/staff-directory");
  return {ok:true,message:"Staff details corrected."};
 }catch{return {ok:false,message:"Could not save staff details. Refresh the register before retrying."};}
}
