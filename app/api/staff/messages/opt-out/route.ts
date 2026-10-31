import {env} from "cloudflare:workers";
import {getCommandAccess} from "@/modules/platform/auth/command-access";
import {privateJson,sameOrigin} from "@/lib/staff-access";

export const dynamic="force-dynamic";
/** Permanent guardian suppression, with held-queue cancellation in one atomic D1 batch. */
export async function POST(request:Request){
 let actor;
 try{actor=await getCommandAccess(request);}catch{return privateJson({error:"Permissions unavailable"},503);}
 if(!actor)return privateJson({error:"Authentication required"},401);
 if(!actor.permissions.includes("communications.manage"))return privateJson({error:"Access denied"},403);
 if(!sameOrigin(request))return privateJson({error:"Invalid request origin"},403);
 if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
  return privateJson({error:"JSON required"},415);
 let body:unknown;
 try{const raw=await request.text();if(raw.length>900)return privateJson({error:"Request too large"},413);body=JSON.parse(raw);}
 catch{return privateJson({error:"Invalid JSON"},400);}
 if(!body||typeof body!=="object"||Array.isArray(body))return privateJson({error:"Invalid request"},400);
 const v=body as Record<string,unknown>;
 const reason=typeof v.reason==="string"?v.reason.trim():"";
 if(typeof v.studentId!=="string"||!/^[-a-zA-Z0-9_]{1,100}$/.test(v.studentId)||
    reason.length<10||reason.length>240)
  return privateJson({error:"Select a student and provide a reason between 10 and 240 characters."},400);
 try{
  const student=await env.DB.prepare("SELECT id,guardian_mobile FROM academy_students WHERE id=? AND merged_into_id IS NULL")
   .bind(v.studentId).first<{id:string;guardian_mobile:string}>();
  if(!student)return privateJson({error:"Student not found"},404);
  const results=await env.DB.batch([
   env.DB.prepare("INSERT OR IGNORE INTO guardian_sms_contact_suppressions(guardian_mobile,source_student_id,reason,recorded_by) VALUES(?,?,?,?)")
    .bind(student.guardian_mobile,v.studentId,reason,actor.profileId),
   env.DB.prepare("INSERT OR IGNORE INTO guardian_sms_optouts(student_id,reason,recorded_by) VALUES(?,?,?)")
    .bind(v.studentId,reason,actor.profileId),
   env.DB.prepare("UPDATE guardian_message_outbox SET status='CANCELLED',"+
    "cancelled_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),cancelled_by=?,cancel_reason='Guardian opted out' "+
    "WHERE status='HELD' AND student_id IN (SELECT id FROM academy_students WHERE guardian_mobile=?)").bind(actor.profileId,student.guardian_mobile),
   env.DB.prepare("INSERT OR IGNORE INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason) "+
    "SELECT 'sms-optout-'||student_id,'guardian_sms_optout',student_id,'OPTOUT',recorded_by,reason "+
    "FROM guardian_sms_optouts WHERE student_id=?").bind(v.studentId),
   env.DB.prepare("INSERT OR IGNORE INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason) "+
    "SELECT 'sms-cancel-'||id,'guardian_message',id,'CANCELLED',cancelled_by,cancel_reason "+
    "FROM guardian_message_outbox WHERE student_id IN (SELECT id FROM academy_students WHERE guardian_mobile=?) AND status='CANCELLED' "+
    "AND cancel_reason='Guardian opted out' AND cancelled_by=?")
    .bind(student.guardian_mobile,actor.profileId),
  ]);
  const cancelled=results[2].meta.changes??0;
  return privateJson({studentId:v.studentId,optedOut:true,cancelledHeld:cancelled,
   replayed:results[0].meta.changes===0});
 }catch{return privateJson({error:"Unable to confirm guardian opt-out. Do not send any message until resolved."},503);}
}
