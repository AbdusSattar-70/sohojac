import {env} from "cloudflare:workers";
import {getCommandAccess} from "@/modules/platform/auth/command-access";
import {privateJson,sameOrigin} from "@/lib/staff-access";

export const dynamic="force-dynamic";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 let actor;
 try{actor=await getCommandAccess(request);}catch{return privateJson({error:"Permissions unavailable"},503);}
 if(!actor)return privateJson({error:"Authentication required"},401);
 if(!actor.permissions.includes("communications.manage"))return privateJson({error:"Access denied"},403);
 if(!sameOrigin(request))return privateJson({error:"Invalid request origin"},403);
 const {id}=await params;
 if(!/^[a-f0-9-]{36}$/i.test(id))return privateJson({error:"Invalid message ID"},400);
 try{
  const results=await env.DB.batch([
   env.DB.prepare("UPDATE guardian_message_outbox SET status='CANCELLED',"+
    "cancelled_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),cancelled_by=?,cancel_reason='Cancelled by staff before dispatch' "+
    "WHERE id=? AND status='HELD'").bind(actor.profileId,id),
   env.DB.prepare("INSERT OR IGNORE INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason) "+
    "SELECT 'sms-cancel-'||id,'guardian_message',id,'CANCELLED',cancelled_by,cancel_reason "+
    "FROM guardian_message_outbox WHERE id=? AND status='CANCELLED' "+
    "AND cancel_reason='Cancelled by staff before dispatch' AND cancelled_by=?").bind(id,actor.profileId)
  ]);
  const row=await env.DB.prepare("SELECT status FROM guardian_message_outbox WHERE id=?")
   .bind(id).first<{status:"HELD"|"CANCELLED"}>();
  if(!row)return privateJson({error:"Message not found"},404);
  return privateJson({id,status:row.status,delivered:false,replayed:results[0].meta.changes===0});
 }catch{return privateJson({error:"Cancellation could not be confirmed. Retry safely."},503);}
}
