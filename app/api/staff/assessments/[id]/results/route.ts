import {env} from "cloudflare:workers";
import {getStaffAccess,privateJson,sameOrigin} from "@/lib/staff-access";
import {markInput} from "@/lib/erp-assessments";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
export async function POST(request:Request,context:Context){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(!["OWNER","ADMIN","OPERATOR"].includes(staff.role))return privateJson({error:"Access denied"},403);
  if(!sameOrigin(request))return privateJson({error:"Invalid request origin"},403);
  const {id}=await context.params;
  if(!/^[0-9a-f-]{36}$/i.test(id))return privateJson({error:"Invalid assessment ID"},400);
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")){
    return privateJson({error:"JSON required"},415);
  }
  let body:unknown;
  try{const raw=await request.text();if(raw.length>2500)return privateJson({error:"Request too large"},413);body=JSON.parse(raw);}
  catch{return privateJson({error:"Invalid JSON"},400);}
  const parsed=markInput.safeParse(body);
  if(!parsed.success)return privateJson({error:"Invalid marks, version or correction reason"},400);
  const d=parsed.data,resultId=crypto.randomUUID();
  try{
    const tx=await env.DB.batch([
      env.DB.prepare([
        "INSERT INTO academy_assessment_results",
        "(id,assessment_id,enrollment_id,obtained_marks,note,graded_by,version)",
        "SELECT ?,a.id,?,?,?,?,? FROM academy_assessments a",
        "JOIN academy_enrollments e ON e.id=? AND e.batch_id=a.batch_id",
        "WHERE a.id=? AND a.status='DRAFT' AND a.max_marks>=?",
        "AND a.held_on<=date('now') AND e.status='ACTIVE' AND date(e.enrolled_at)<=a.held_on",
        "ON CONFLICT(assessment_id,enrollment_id) DO UPDATE SET",
        "obtained_marks=excluded.obtained_marks,note=excluded.note,",
        "graded_by=excluded.graded_by,version=excluded.version,",
        "graded_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",
        "WHERE academy_assessment_results.version=excluded.version-1 RETURNING id"
      ].join(" ")).bind(resultId,d.enrollmentId,d.marks,d.note||null,staff.userId,
        d.expectedVersion+1,d.enrollmentId,id,d.marks),
      env.DB.prepare([
        "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,after_json)",
        "SELECT ?,'academy_assessment_result',?,'MARKS_SAVED',?,?,? WHERE changes()=1 RETURNING id"
      ].join(" ")).bind(crypto.randomUUID(),id+":"+d.enrollmentId,staff.userId,d.reason,
        JSON.stringify({marks:d.marks,version:d.expectedVersion+1})),
    ]);
    if(tx.some(x=>(x.results?.length??0)!==1)){
      return privateJson({error:"Marks changed or assessment cannot be graded; refresh"},409);
    }
    return privateJson({ok:true,version:d.expectedVersion+1});
  }catch{return privateJson({error:"Marks rejected: invalid enrollment, range or published assessment"},409);}
}
