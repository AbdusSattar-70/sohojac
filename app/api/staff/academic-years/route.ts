import {env} from "cloudflare:workers";
import {getStaffAccess,privateJson,sameOrigin} from "@/lib/staff-access";
import {yearInput,type AcademicYearRow} from "@/lib/academic-years";
export const dynamic="force-dynamic";

export async function GET(request:Request){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  try{
    const list=await env.DB.prepare(`SELECT id,code,title,starts_on,ends_on,status,version
      FROM academic_years
      ORDER BY CASE status WHEN 'ACTIVE' THEN 0 WHEN 'DRAFT' THEN 1 ELSE 2 END,
        code DESC LIMIT 100`).all<AcademicYearRow>();
    return privateJson({items:list.results??[],canEdit:["OWNER","ADMIN"].includes(staff.role)});
  }catch{return privateJson({error:"Academic years unavailable"},503);}
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
  try{
    const raw=await request.text();
    if(raw.length>2000)return privateJson({error:"Request too large"},413);
    body=JSON.parse(raw);
  }catch{return privateJson({error:"Invalid JSON"},400);}
  const parsed=yearInput.safeParse(body);
  if(!parsed.success)return privateJson({error:"Check academic year details"},400);
  const row=parsed.data,id=crypto.randomUUID();
  try{
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO academic_years
        (id,code,title,starts_on,ends_on,status)
        VALUES (?,?,?,?,?,'DRAFT')`)
        .bind(id,row.code,row.title,row.startsOn||null,row.endsOn||null),
      env.DB.prepare(`INSERT INTO erp_audit_events
        (id,entity_type,entity_id,action,actor_id,reason,after_json)
        VALUES (?,'academic_year',?,'CREATED',?,'Academic year created',?)`)
        .bind(crypto.randomUUID(),id,staff.userId,JSON.stringify({...row,status:"DRAFT"})),
    ]);
    return privateJson({ok:true,id,status:"DRAFT"},201);
  }catch{
    return privateJson({error:"Could not create year. Check for duplicate code."},409);
  }
}
