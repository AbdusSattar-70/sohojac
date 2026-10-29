import {env} from "cloudflare:workers";
import {getStaffAccess,privateJson,sameOrigin} from "@/lib/staff-access";
import {assignSubject} from "@/lib/erp-subjects";
export const dynamic="force-dynamic";
export async function POST(request:Request){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(!["OWNER","ADMIN"].includes(staff.role))return privateJson({error:"Access denied"},403);
  if(!sameOrigin(request))return privateJson({error:"Invalid request origin"},403);
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))return privateJson({error:"JSON required"},415);
  let body:unknown;
  try{const raw=await request.text();if(raw.length>2000)return privateJson({error:"Request too large"},413);body=JSON.parse(raw);}
  catch{return privateJson({error:"Invalid JSON"},400);}
  const parsed=assignSubject.safeParse(body);
  if(!parsed.success)return privateJson({error:"Invalid subject, offering or reason"},400);
  const d=parsed.data;
  const sql=d.action==="ADD"?[
    "INSERT INTO academy_offering_subjects(offering_id,subject_id)",
    "SELECT o.id,s.id FROM public_programme_offerings o",
    "JOIN academy_subjects s ON s.id=? AND s.active=1",
    "WHERE o.id=? AND o.version=? RETURNING subject_id"
  ].join(" "):[
    "DELETE FROM academy_offering_subjects",
    "WHERE offering_id=? AND subject_id=?",
    "AND EXISTS(SELECT 1 FROM public_programme_offerings",
    "WHERE id=? AND version=?) RETURNING subject_id"
  ].join(" ");
  const args=d.action==="ADD"?[d.subjectId,d.offeringId,d.expectedOfferingVersion]:
    [d.offeringId,d.subjectId,d.offeringId,d.expectedOfferingVersion];
  try{
    const tx=await env.DB.batch([
      env.DB.prepare(sql).bind(...args),
      env.DB.prepare([
        "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,after_json)",
        "SELECT ?,'offering_subject',?,?,?, ?,? WHERE changes()=1 RETURNING id"
      ].join(" ")).bind(crypto.randomUUID(),d.offeringId+":"+d.subjectId,d.action==="ADD"?"ASSIGNED":"UNASSIGNED",
        staff.userId,d.reason,JSON.stringify({subjectId:d.subjectId,offeringId:d.offeringId})),
    ]);
    if(tx.some(x=>(x.results?.length??0)!==1)){
      return privateJson({error:"Subject link changed, is inactive, or offering version is stale"},409);
    }
    return privateJson({ok:true,action:d.action});
  }catch{return privateJson({error:"Duplicate subject assignment or stale offering; refresh"},409);}
}
