import { env } from "cloudflare:workers";
import { z } from "zod";
import { getStaffAccess, privateJson, sameOrigin } from "@/lib/staff-access";

export const dynamic = "force-dynamic";
type Context={params: Promise<{id:string}>};
const schema=z.object({
  decision:z.enum(["VERIFIED","DECLINED"]),
  assignedRole:z.enum(["ADMIN","OPERATOR","TEACHER","ACCOUNTANT"]).optional(),
  note:z.string().trim().min(10).max(500),
}).strict();

export async function PATCH(request:Request,context:Context) {
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(!["OWNER","ADMIN"].includes(staff.role))return privateJson({error:"Access denied"},403);
  if(!sameOrigin(request))return privateJson({error:"Invalid origin"},403);
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return privateJson({error:"JSON required"},415);
  }
  const {id}=await context.params;
  if(!/^[0-9a-f-]{36}$/i.test(id))return privateJson({error:"Invalid request ID"},400);
  let body:unknown;
  try{
    const raw=await request.text();
    if(raw.length>1800)return privateJson({error:"Request too large"},413);
    body=JSON.parse(raw);
  }catch{return privateJson({error:"Invalid JSON"},400);}
  const parsed=schema.safeParse(body);
  if(!parsed.success)return privateJson({error:"Provide a decision and verification note"},400);
  const {decision,note,assignedRole}=parsed.data;
  if(decision==="VERIFIED"&&!assignedRole)return privateJson({error:"Choose verified role"},400);
  if(staff.role==="ADMIN" && assignedRole==="ADMIN") {
    return privateJson({error:"Only the owner may assign an administrator"},403);
  }
  // Current D1 membership role constraint has no ACCOUNTANT value.
  // Verify such requests, but never activate an unsupported permission class.
  if(decision==="VERIFIED" && assignedRole==="ACCOUNTANT") {
    return privateJson({error:"Accountant role requires the upcoming finance access policy"},409);
  }
  try{
    const present=await env.DB.prepare("SELECT status FROM staff_access_requests WHERE id=?")
      .bind(id).first<{status:string}>();
    if(!present)return privateJson({error:"Request not found"},404);
    if(present.status!=="PENDING")return privateJson({error:"This request has already been reviewed"},409);
    const updatedAt=new Date().toISOString();
    const result=await env.DB.batch([
      env.DB.prepare(`UPDATE staff_access_requests
        SET status=?,assigned_role=?,review_note=?,reviewed_by=?,reviewed_at=?,updated_at=?
        WHERE id=? AND status='PENDING'`)
        .bind(decision,decision==="VERIFIED"?assignedRole:null,note,staff.userId,updatedAt,updatedAt,id),
      env.DB.prepare(`INSERT INTO erp_audit_events
        (id,entity_type,entity_id,action,actor_id,reason,before_json,after_json)
        SELECT ?,'staff_access_request',?,?,?,?,'{"status":"PENDING"}',?
        WHERE changes()=1`)
        .bind(crypto.randomUUID(),id,decision,staff.userId,note,
          JSON.stringify({status:decision,assignedRole:decision==="VERIFIED"?assignedRole:null})),
    ]);
    if(result[0].meta.changes!==1||result[1].meta.changes!==1){
      return privateJson({error:"Request changed; refresh and retry"},409);
    }
    return privateJson({ok:true,status:decision});
  }catch{return privateJson({error:"Could not review request"},503);}
}
