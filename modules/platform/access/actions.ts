"use server";
import {z} from "zod";
import {env} from "cloudflare:workers";
import {headers} from "next/headers";
import {revalidatePath} from "next/cache";
import {getErpContext} from "@/modules/platform/auth/erp-context";
import {sendStaffEmail,staffMailConfigured,staffMailRecipientAllowed} from "@/lib/staff-mail";

const roles=z.enum(["ADMIN","OPERATOR","TEACHER","ACCOUNTANT"]);
const reviewSchema=z.object({
 id:z.string().uuid(),
 action:z.enum(["VERIFY","DECLINE","INVITE"]),
 assigned_role:roles,
 reason:z.string().trim().min(5).max(500)
});
type RequestRow={
 id:string;full_name:string;email:string;requested_role:string;
 assigned_role:string|null;status:string;latest_invite_at:string|null;
};
const originValid=async()=>{
 const h=await headers(),origin=h.get("origin"),host=h.get("host");
 if(!origin||!host)return false;
 try{return new URL(origin).host.toLowerCase()===host.toLowerCase();}
 catch{return false;}
};
const hex=(values:Uint8Array)=>
 [...values].map(value=>value.toString(16).padStart(2,"0")).join("");

/** Original source action; D1 replaces RPC and Resend replaces Supabase mail. */
export async function reviewStaffAccess(input:unknown){
 const parsed=reviewSchema.safeParse(input);
 if(!parsed.success)return {ok:false,message:"Choose a role and verification note."};
 const context=await getErpContext();
 if(!context?.roles.includes("ADMIN")||
     !context.permissions.includes("system.users.manage"))
  return {ok:false,message:"Super admin verification required."};
 if(!await originValid())return {ok:false,message:"Invalid request origin."};
 const v=parsed.data;
 // The currently deployed membership table does not grant ACCOUNTANT.
 if(v.assigned_role==="ACCOUNTANT")
  return {ok:false,message:"Accountant access needs the finance permission migration before assignment."};
 if(v.assigned_role==="ADMIN"&&!context.roles.includes("OWNER"))
  return {ok:false,message:"Only the owner may assign an administrator."};
 if(v.reason.length<10)return {ok:false,message:"Write at least ten characters explaining your decision."};
 try{
  const row=await env.DB.prepare(
   "SELECT r.id,r.full_name,r.email,r.requested_role,r.assigned_role,r.status,"+
   "(SELECT MAX(t.created_at) FROM staff_invitation_tokens t "+
   "WHERE t.request_id=r.id) AS latest_invite_at "+
   "FROM staff_access_requests r WHERE r.id=?"
  ).bind(v.id).first<RequestRow>();
  if(!row)return {ok:false,message:"Access request unavailable. Refresh the register."};
  if(v.action!=="INVITE"){
   if(!["PENDING","VERIFIED","INVITED"].includes(row.status))
    return {ok:false,message:"Request was already closed or activated."};
   if(v.action==="VERIFY" && row.status==="INVITED")
    return {ok:false,message:"Invitation already issued; decline to revoke or resend the verified role."};
   const next=v.action==="VERIFY"?"VERIFIED":"DECLINED";
   const now=new Date().toISOString();
   const actions=[
    env.DB.prepare(
     "UPDATE staff_access_requests SET status=?,assigned_role=?,review_note=?,"+
     "reviewed_by=?,reviewed_at=?,updated_at=? WHERE id=? AND status=?"
    ).bind(next,next==="VERIFIED"?v.assigned_role:null,v.reason,
      context.profileId,now,now,v.id,row.status)
   ];
   if(next==="DECLINED"){
    actions.push(env.DB.prepare(
     "UPDATE staff_invitation_tokens SET consumed_at=? WHERE request_id=? AND consumed_at IS NULL"
    ).bind(now,v.id));
   }
   actions.push(env.DB.prepare(
    "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,before_json,after_json) "+
    "VALUES (?,'staff_access_request',?,?,?,?,?,?)"
   ).bind(crypto.randomUUID(),v.id,next,context.profileId,v.reason,
     JSON.stringify({status:row.status,assignedRole:row.assigned_role}),
     JSON.stringify({status:next,assignedRole:next==="VERIFIED"?v.assigned_role:null})));
   const result=await env.DB.batch(actions);
   if(result[0].meta.changes!==1||result[result.length-1].meta.changes!==1)
    return {ok:false,message:"Request changed. Refresh before retrying."};
   revalidatePath("/dashboard/staff");
   return {ok:true,message:"Request updated.",messageBn:"অনুরোধ আপডেট হয়েছে।"};
  }
  if(!["VERIFIED","INVITED"].includes(row.status) ||
     row.assigned_role!==v.assigned_role)
   return {ok:false,message:"Verify this exact role before sending an invitation."};
  if(!staffMailConfigured())
   return {ok:false,message:"Staff invitation email is not ready. Check Staff & access → Email delivery setup."};
  if(!staffMailRecipientAllowed(row.email))
   return {ok:false,message:"This recipient is not in the development email test allowlist. Check email delivery setup."};
  if(row.latest_invite_at&&Date.now()-Date.parse(row.latest_invite_at)<60_000)
   return {ok:false,message:"An invitation was just issued. Retry after a minute."};
  const duplicate=await env.DB.prepare(
   'SELECT id FROM "user" WHERE email=?'
  ).bind(row.email).first();
  if(duplicate)return {ok:false,message:"An account already exists for this email."};
  const token=hex(crypto.getRandomValues(new Uint8Array(32)));
  const hash=hex(new Uint8Array(await crypto.subtle.digest(
   "SHA-256",new TextEncoder().encode(token)
  )));
  const inviteId=crypto.randomUUID(),now=new Date().toISOString();
  const expires=new Date(Date.now()+24*3600_000).toISOString();
  const result=await env.DB.batch([
   env.DB.prepare("UPDATE staff_invitation_tokens SET consumed_at=? WHERE request_id=? AND consumed_at IS NULL")
    .bind(now,v.id),
   env.DB.prepare(
    "INSERT INTO staff_invitation_tokens(id,request_id,token_hash,expires_at,created_by) VALUES (?,?,?,?,?)"
   ).bind(inviteId,v.id,hash,expires,context.profileId),
   env.DB.prepare(
    "UPDATE staff_access_requests SET status='INVITED',updated_at=? "+
    "WHERE id=? AND status IN ('VERIFIED','INVITED') AND assigned_role=?"
   ).bind(now,v.id,v.assigned_role),
   env.DB.prepare(
    "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason) "+
    "SELECT ?,'staff_access_request',?,'INVITATION_ISSUED',?,? WHERE changes()=1"
   ).bind(crypto.randomUUID(),v.id,context.profileId,v.reason)
  ]);
  if(result[1].meta.changes!==1||result[2].meta.changes!==1||result[3].meta.changes!==1)
   return {ok:false,message:"Invitation state changed. Refresh and retry."};
  const h=await headers();
  const host=h.get("host");
  if(!host)return {ok:false,message:"Invitation saved, but delivery URL is unavailable. Retry after refresh."};
  // The origin is validated earlier and is never taken from arbitrary user input.
  const url=new URL(h.get("origin")!);
  const link=url.origin+"/accept-invitation?token="+encodeURIComponent(token);
  try{
   await sendStaffEmail({
    recipient:row.email,
    subject:"Sohoj Academy — your staff access invitation",
    text:"Your staff access request was verified. Set your password within 24 hours:\n"+link+
     "\n\nIf you did not request access, notify Sohoj Academy.",
    idempotencyKey:"staff-invite-"+inviteId
   });
  }catch{return {ok:false,message:"Invitation was created, but delivery failed. Retry the verified request after cooldown."};}
  revalidatePath("/dashboard/staff");
  return {ok:true,message:"Secure account setup instructions sent. The verified role is now assigned.",
   messageBn:"নিরাপদ অ্যাকাউন্ট চালুর নির্দেশনা পাঠানো হয়েছে।"};
 }catch{return {ok:false,message:"Could not finish this action. Refresh before retrying."};}
}

// The original public-access request also requires Cloudflare Turnstile.
// The production /request-access POST remains the audited public entrypoint.
// Do not create a server-action bypass that accepts unverified applicants.
export async function requestStaffAccess(_input:unknown){
 return {ok:false,message:"Use the verified /request-access form to request ERP access."};
}
