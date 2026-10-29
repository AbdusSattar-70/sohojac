import {env} from "cloudflare:workers";
import {getStaffAccess,privateJson,sameOrigin} from "@/lib/staff-access";
import {createSession,type SessionRow} from "@/lib/erp-routine";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(!["OWNER","ADMIN","OPERATOR"].includes(staff.role))return privateJson({error:"Access denied"},403);
  try{
    const [sessions,batches]=await Promise.all([
      env.DB.prepare([
        "SELECT s.id,s.batch_id,b.name AS batch_name,s.class_on,s.starts_at,s.ends_at,",
        "s.title,s.topic,s.status,u.name AS created_name,s.version",
        "FROM academy_class_sessions s JOIN academy_batches b ON b.id=s.batch_id",
        "LEFT JOIN \"user\" u ON u.id=s.created_by",
        "ORDER BY s.class_on DESC,s.starts_at DESC LIMIT 150"
      ].join(" ")).all<SessionRow>(),
      env.DB.prepare("SELECT id,name FROM academy_batches WHERE status='ACTIVE' ORDER BY name LIMIT 150").all<{id:string;name:string}>(),
    ]);
    return privateJson({items:sessions.results??[],batches:batches.results??[],
      canEdit:["OWNER","ADMIN"].includes(staff.role)});
  }catch{return privateJson({error:"Routine unavailable"},503);}
}
export async function POST(request:Request){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(!["OWNER","ADMIN"].includes(staff.role))return privateJson({error:"Access denied"},403);
  if(!sameOrigin(request))return privateJson({error:"Invalid request origin"},403);
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")){
    return privateJson({error:"JSON required"},415);
  }
  let body:unknown;
  try{const raw=await request.text();if(raw.length>2500)return privateJson({error:"Request too large"},413);body=JSON.parse(raw);}
  catch{return privateJson({error:"Invalid JSON"},400);}
  const parsed=createSession.safeParse(body);
  if(!parsed.success)return privateJson({error:"Check class date, times, title and reason"},400);
  const data=parsed.data,id=crypto.randomUUID();
  try{
    const tx=await env.DB.batch([
      env.DB.prepare([
        "INSERT INTO academy_class_sessions",
        "(id,batch_id,class_on,starts_at,ends_at,title,topic,created_by)",
        "SELECT ?,b.id,?,?,?,?,?,? FROM academy_batches b",
        "WHERE b.id=? AND b.status='ACTIVE'",
        "AND ? BETWEEN date('now','-30 days') AND date('now','+365 days')",
        "AND (b.begins_on IS NULL OR ?>=b.begins_on)",
        "AND (b.ends_on IS NULL OR ?<=b.ends_on) RETURNING id"
      ].join(" ")).bind(id,data.classOn,data.startsAt,data.endsAt,data.title,
        data.topic||null,staff.userId,data.batchId,data.classOn,data.classOn,data.classOn),
      env.DB.prepare([
        "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,after_json)",
        "SELECT ?,'class_session',?,'SCHEDULED',?,?,? WHERE changes()=1 RETURNING id"
      ].join(" ")).bind(crypto.randomUUID(),id,staff.userId,data.reason,
        JSON.stringify({batchId:data.batchId,classOn:data.classOn,startsAt:data.startsAt,
          endsAt:data.endsAt,title:data.title})),
    ]);
    if(tx.some(x=>(x.results?.length??0)!==1))return privateJson({error:"Invalid batch or class calendar date"},409);
    return privateJson({ok:true,id,status:"SCHEDULED",version:1},201);
  }catch{return privateJson({error:"Session conflicts with another session or is not allowed"},409);}
}
