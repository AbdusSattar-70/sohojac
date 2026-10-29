import {env} from "cloudflare:workers";
import {getStaffAccess,privateJson,sameOrigin} from "@/lib/staff-access";
import {patchAdmission} from "@/lib/erp-admissions";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
type State={id:string;status:string;version:number;offering_id:string;};
export async function PATCH(request:Request,context:Context){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(!["OWNER","ADMIN","OPERATOR"].includes(staff.role))return privateJson({error:"Access denied"},403);
  if(!sameOrigin(request))return privateJson({error:"Invalid request origin"},403);
  const {id}=await context.params;
  if(!/^[0-9a-f-]{36}$/i.test(id))return privateJson({error:"Invalid application ID"},400);
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))return privateJson({error:"JSON required"},415);
  let body:unknown;
  try{const raw=await request.text();if(raw.length>4000)return privateJson({error:"Request too large"},413);body=JSON.parse(raw);}
  catch{return privateJson({error:"Invalid JSON"},400);}
  const parsed=patchAdmission.safeParse(body);
  if(!parsed.success)return privateJson({error:"Check verification data and reason"},400);
  const data=parsed.data;
  if(["ACCEPT","REJECT"].includes(data.action)&&!["OWNER","ADMIN"].includes(staff.role)){
    return privateJson({error:"Only an owner or administrator can approve or reject"},403);
  }
  try{
    const current=await env.DB.prepare("SELECT id,status,version,offering_id FROM academy_admissions WHERE id=?").bind(id).first<State>();
    if(!current)return privateJson({error:"Application not found"},404);
    if(current.version!==data.expectedVersion)return privateJson({error:"Application changed; refresh first"},409);
    if(current.status!==(data.action==="SAVE"||data.action==="REVIEW"?"DRAFT":"REVIEW")){
      return privateJson({error:"Invalid application transition"},409);
    }
    let query:string;
    let binds:(string|number|null)[];
    let nextStatus:string;
    if(data.action==="SAVE"){
      query=[
        "UPDATE academy_admissions SET student_full_name=?,class_grade=?,guardian_full_name=?,",
        "guardian_mobile=?,school_name=?,version=version+1,",
        "updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",
        "WHERE id=? AND status='DRAFT' AND version=?"
      ].join(" ");
      binds=[data.studentName,data.classGrade,data.guardianName,data.guardianMobile,
        data.schoolName||null,id,data.expectedVersion];
      nextStatus="DRAFT";
    }else if(data.action==="REVIEW"){
      query=[
        "UPDATE academy_admissions SET status='REVIEW',version=version+1,",
        "updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",
        "WHERE id=? AND status='DRAFT' AND version=?"
      ].join(" ");
      binds=[id,data.expectedVersion];nextStatus="REVIEW";
    }else if(data.action==="REJECT"){
      query=[
        "UPDATE academy_admissions SET status='REJECTED',review_note=?,verified_by=?,",
        "version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",
        "WHERE id=? AND status='REVIEW' AND version=?"
      ].join(" ");
      binds=[data.reason,staff.userId,id,data.expectedVersion];nextStatus="REJECTED";
    }else{
      query=[
        "UPDATE academy_admissions SET status='ACCEPTED',review_note=?,verified_by=?,approved_by=?,",
        "consent_verified=1,batch_id=?,fee_plan_id=?,version=version+1,",
        "updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",
        "WHERE id=? AND status='REVIEW' AND version=?",
        "AND EXISTS (SELECT 1 FROM academy_batches b",
        "JOIN public_programme_offerings p ON p.id=b.offering_id",
        "WHERE b.id=? AND b.offering_id=academy_admissions.offering_id",
        "AND b.status='ACTIVE' AND p.is_active=1 AND b.capacity>",
        "(SELECT COUNT(*) FROM academy_enrollments e WHERE e.batch_id=b.id AND e.status='ACTIVE'))",
        "AND EXISTS (SELECT 1 FROM academy_fee_plans f WHERE f.id=?",
        "AND f.active=1 AND f.offering_id=academy_admissions.offering_id)"
      ].join(" ");
      binds=[data.reason,staff.userId,staff.userId,data.batchId,data.feePlanId,
        id,data.expectedVersion,data.batchId,data.feePlanId];
      nextStatus="ACCEPTED";
    }
    const result=await env.DB.batch([
      env.DB.prepare(query).bind(...binds),
      env.DB.prepare([
        "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,before_json,after_json)",
        "SELECT ?,'admission',?,?,?,?,?,? WHERE changes()=1"
      ].join(" ")).bind(crypto.randomUUID(),id,data.action,staff.userId,data.reason,
        JSON.stringify(current),JSON.stringify({status:nextStatus,version:data.expectedVersion+1})),
    ]);
    if(result[0].meta.changes!==1||result[1].meta.changes!==1){
      return privateJson({error:"Application changed, class full or plan/batch inactive"},409);
    }
    return privateJson({ok:true,status:nextStatus,version:data.expectedVersion+1});
  }catch{return privateJson({error:"Could not advance application"},503);}
}
