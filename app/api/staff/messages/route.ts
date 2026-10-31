import {env} from "cloudflare:workers";
import {getCommandAccess} from "@/modules/platform/auth/command-access";
import {privateJson,sameOrigin} from "@/lib/staff-access";

export const dynamic="force-dynamic";
type QueueRow={id:string;student_id:string;student_no:string;full_name:string;template_key:string;status:string;created_at:string};
const allowedTemplates=new Set(["ADMISSION_FOLLOWUP","GENERAL_REMINDER"]);

/** Held only: no SMS provider, credentials or outbound network call is reachable here. */
export async function GET(request:Request){
 let actor;
 try{actor=await getCommandAccess(request);}catch{return privateJson({error:"Permissions unavailable"},503);}
 if(!actor)return privateJson({error:"Authentication required"},401);
 if(!actor.permissions.includes("audit.view"))return privateJson({error:"Access denied"},403);
 try{
  const rows=await env.DB.prepare(
   "SELECT o.id,o.student_id,s.student_no,s.full_name,o.template_key,o.status,o.created_at "+
   "FROM guardian_message_outbox o JOIN academy_students s ON s.id=o.student_id "+
   "ORDER BY o.created_at DESC,o.id DESC LIMIT 100"
  ).all<QueueRow>();
  return privateJson({items:rows.results??[],deliveryEnabled:false,
   notice:"Messages are held and have not been sent. SMS dispatch requires separate approval."});
 }catch{return privateJson({error:"Outbox unavailable"},503);}
}

export async function POST(request:Request){
 let actor;
 try{actor=await getCommandAccess(request);}catch{return privateJson({error:"Permissions unavailable"},503);}
 if(!actor)return privateJson({error:"Authentication required"},401);
 if(!actor.permissions.includes("audit.view"))return privateJson({error:"Access denied"},403);
 if(!sameOrigin(request))return privateJson({error:"Invalid request origin"},403);
 if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
  return privateJson({error:"JSON required"},415);
 let data:unknown;
 try{const raw=await request.text();if(raw.length>1000)return privateJson({error:"Request too large"},413);data=JSON.parse(raw);}
 catch{return privateJson({error:"Invalid JSON"},400);}
 if(!data||typeof data!=="object"||Array.isArray(data))return privateJson({error:"Invalid request"},400);
 const body=data as Record<string,unknown>;
 if(typeof body.studentId!=="string"||!/^[-a-zA-Z0-9_]{1,100}$/.test(body.studentId)||
    typeof body.requestId!=="string"||! /^[a-f0-9-]{36}$/i.test(body.requestId)||
    typeof body.templateKey!=="string"||!allowedTemplates.has(body.templateKey)||
    body.consentAttested!==true)
  return privateJson({error:"Choose a valid student/template, provide a new request ID and attest guardian SMS consent."},400);
 try{
  const existing=await env.DB.prepare(
   "SELECT id,student_id,template_key,status FROM guardian_message_outbox WHERE request_id=?"
  ).bind(body.requestId).first<{id:string;student_id:string;template_key:string;status:string}>();
  if(existing){
   if(existing.student_id!==body.studentId||existing.template_key!==body.templateKey)
    return privateJson({error:"This request ID was already used for a different message"},409);
   return privateJson({id:existing.id,status:existing.status,delivered:false,replayed:true});
  }
  const student=await env.DB.prepare(
   "SELECT id,guardian_mobile FROM academy_students WHERE id=? AND status='ACTIVE' AND merged_into_id IS NULL"
  ).bind(body.studentId).first<{id:string;guardian_mobile:string}>();
  if(!student||!/^01[3-9][0-9]{8}$/.test(student.guardian_mobile))
   return privateJson({error:"Active student and valid guardian mobile required"},400);
  const id=crypto.randomUUID();
  const results=await env.DB.batch([
   env.DB.prepare("INSERT OR IGNORE INTO guardian_message_outbox (id,request_id,student_id,template_key,consent_attested,created_by) VALUES (?,?,?,?,1,?)")
    .bind(id,body.requestId,body.studentId,body.templateKey,actor.profileId),
   env.DB.prepare("INSERT OR IGNORE INTO erp_audit_events (id,entity_type,entity_id,action,actor_id,reason) "+
    "SELECT ?, 'guardian_message', id, 'HELD', ?, 'Guardian SMS consent attested; delivery disabled' "+
    "FROM guardian_message_outbox WHERE id=?")
    .bind("sms-queued-"+id,actor.profileId,id)
  ]);
  const inserted=results[0].meta.changes===1;
  const row=await env.DB.prepare(
   "SELECT id,student_id,template_key,status FROM guardian_message_outbox WHERE request_id=?"
  ).bind(body.requestId).first<{id:string;student_id:string;template_key:string;status:string}>();
  if(!row||row.student_id!==body.studentId||row.template_key!==body.templateKey)
   return privateJson({error:"Request ID collision; use a different ID"},409);
  return privateJson({id:row.id,status:row.status,delivered:false,replayed:!inserted},inserted?201:200);
 }catch{return privateJson({error:"Outbox could not confirm the request. Retry using the same request ID."},503);}
}
