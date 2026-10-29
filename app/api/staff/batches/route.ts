import {env} from "cloudflare:workers";
import {getStaffAccess,privateJson,sameOrigin} from "@/lib/staff-access";
import {batchCreate,type BatchRow} from "@/lib/erp-batches";

export const dynamic="force-dynamic";
const isEditor=(role:string)=>role==="OWNER"||role==="ADMIN";
async function parseBody(request:Request){
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))return {status:415 as const,body:null};
  try{
    const raw=await request.text();
    if(raw.length>3000)return {status:413 as const,body:null};
    return {status:200 as const,body:JSON.parse(raw) as unknown};
  }catch{return {status:400 as const,body:null};}
}

export async function GET(request:Request){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  try{
    const [batches,offerings,years]=await Promise.all([
      env.DB.prepare([
        "SELECT b.id,b.code,b.name,b.offering_id,p.name AS offering_name,",
        "b.year_id,y.title AS year_title,b.capacity,b.begins_on,b.ends_on,b.status,b.version,",
        "(SELECT COUNT(*) FROM academy_enrollments e WHERE e.batch_id=b.id AND e.status='ACTIVE') AS enrolled_count",
        "FROM academy_batches b JOIN public_programme_offerings p ON p.id=b.offering_id",
        "LEFT JOIN academic_years y ON y.id=b.year_id",
        "ORDER BY CASE b.status WHEN 'ACTIVE' THEN 0 WHEN 'PLANNED' THEN 1 ELSE 2 END,b.created_at DESC LIMIT 150"
      ].join(" ")).all<BatchRow>(),
      env.DB.prepare("SELECT id,name,is_active FROM public_programme_offerings ORDER BY name LIMIT 150").all<{id:string;name:string;is_active:number}>(),
      env.DB.prepare("SELECT id,title,status FROM academic_years WHERE status!='CLOSED' ORDER BY code DESC LIMIT 100").all<{id:string;title:string;status:string}>(),
    ]);
    return privateJson({items:batches.results??[],offerings:offerings.results??[],
      years:years.results??[],canEdit:isEditor(staff.role)});
  }catch{return privateJson({error:"Batch register unavailable"},503);}
}

export async function POST(request:Request){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(!isEditor(staff.role))return privateJson({error:"Access denied"},403);
  if(!sameOrigin(request))return privateJson({error:"Invalid request origin"},403);
  const body=await parseBody(request);
  if(body.status!==200)return privateJson({error:"Invalid JSON request"},body.status);
  const parsed=batchCreate.safeParse(body.body);
  if(!parsed.success)return privateJson({error:"Check batch details and 12-student maximum"},400);
  const data=parsed.data,id=crypto.randomUUID();
  try{
    // Insert is conditioned on real reference rows, not client-submitted names.
    const result=await env.DB.batch([
      env.DB.prepare([
        "INSERT INTO academy_batches(id,code,name,offering_id,year_id,capacity,begins_on,ends_on,status)",
        "SELECT ?,?,?,?,?,?,?,?,'PLANNED'",
        "WHERE EXISTS(SELECT 1 FROM public_programme_offerings WHERE id=?)",
        "AND (?='' OR EXISTS(SELECT 1 FROM academic_years WHERE id=? AND status!='CLOSED'))"
      ].join(" ")).bind(id,data.code,data.name,data.offeringId,data.yearId||null,
        data.capacity,data.beginsOn||null,data.endsOn||null,data.offeringId,data.yearId,data.yearId),
      env.DB.prepare([
        "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,after_json)",
        "SELECT ?,'academy_batch',?,'CREATED',?,?,? WHERE changes()=1"
      ].join(" ")).bind(crypto.randomUUID(),id,staff.userId,data.reason,JSON.stringify(data)),
    ]);
    if(result[0].meta.changes!==1||result[1].meta.changes!==1){
      return privateJson({error:"Offering or year is unavailable"},409);
    }
    return privateJson({ok:true,id,status:"PLANNED",version:1},201);
  }catch{return privateJson({error:"Cannot create batch. Check code, dates and references."},409);}
}
