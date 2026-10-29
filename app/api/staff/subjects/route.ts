import {env} from "cloudflare:workers";
import {getStaffAccess,privateJson,sameOrigin} from "@/lib/staff-access";
import {createSubject,type SubjectRow,type OfferingSubjectRow} from "@/lib/erp-subjects";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  try{
    const [subjects,offerings,links]=await Promise.all([
      env.DB.prepare([
        "SELECT id,code,name,class_grade,group_name,active,version",
        "FROM academy_subjects ORDER BY class_grade,group_name,name LIMIT 300"
      ].join(" ")).all<SubjectRow>(),
      env.DB.prepare([
        "SELECT id,name,version,subjects_json FROM public_programme_offerings",
        "ORDER BY name LIMIT 100"
      ].join(" ")).all<OfferingSubjectRow>(),
      env.DB.prepare("SELECT offering_id,subject_id FROM academy_offering_subjects LIMIT 1000")
        .all<{offering_id:string;subject_id:string}>(),
    ]);
    return privateJson({items:subjects.results??[],offerings:offerings.results??[],
      links:links.results??[],canEdit:["OWNER","ADMIN"].includes(staff.role)});
  }catch{return privateJson({error:"Subject catalogue unavailable"},503);}
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
  try{const raw=await request.text();if(raw.length>2000)return privateJson({error:"Request too large"},413);body=JSON.parse(raw);}
  catch{return privateJson({error:"Invalid JSON"},400);}
  const parsed=createSubject.safeParse(body);
  if(!parsed.success)return privateJson({error:"Check subject code, name, class and group"},400);
  const d=parsed.data,id=crypto.randomUUID();
  try{
    const tx=await env.DB.batch([
      env.DB.prepare([
        "INSERT INTO academy_subjects(id,code,name,class_grade,group_name)",
        "VALUES (?,?,?,?,?) RETURNING id"
      ].join(" ")).bind(id,d.code,d.name,d.classGrade,d.group),
      env.DB.prepare([
        "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,after_json)",
        "SELECT ?,'academy_subject',?,'CREATED',?,?,? WHERE changes()=1 RETURNING id"
      ].join(" ")).bind(crypto.randomUUID(),id,staff.userId,d.reason,JSON.stringify(d)),
    ]);
    if(tx.some(x=>(x.results?.length??0)!==1))return privateJson({error:"Subject not created"},409);
    return privateJson({ok:true,id,version:1},201);
  }catch{return privateJson({error:"Subject code already used for this class and group"},409);}
}
