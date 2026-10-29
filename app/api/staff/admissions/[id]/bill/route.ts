import {env} from "cloudflare:workers";
import {z} from "zod";
import {getStaffAccess,privateJson,sameOrigin} from "@/lib/staff-access";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
const input=z.object({expectedVersion:z.number().int().min(1),
  reason:z.string().trim().min(8).max(500)}).strict();
export async function POST(request:Request,context:Context){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(!["OWNER","ADMIN","OPERATOR"].includes(staff.role))return privateJson({error:"Access denied"},403);
  if(!sameOrigin(request))return privateJson({error:"Invalid request origin"},403);
  const {id}=await context.params;
  if(!/^[0-9a-f-]{36}$/i.test(id))return privateJson({error:"Invalid application ID"},400);
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))return privateJson({error:"JSON required"},415);
  let body:unknown;
  try{const raw=await request.text();if(raw.length>1500)return privateJson({error:"Request too large"},413);body=JSON.parse(raw);}
  catch{return privateJson({error:"Invalid JSON"},400);}
  const parsed=input.safeParse(body);
  if(!parsed.success)return privateJson({error:"Missing version or billing reason"},400);
  const data=parsed.data,billId=crypto.randomUUID();
  const reference="SA-BILL-"+crypto.randomUUID().replace(/-/g,"").slice(0,12).toUpperCase();
  try{
    const tx=await env.DB.batch([
      env.DB.prepare([
        "UPDATE academy_admissions SET status='BILLED',version=version+1,",
        "updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",
        "WHERE id=? AND status='ACCEPTED' AND version=? AND consent_verified=1",
        "AND EXISTS (SELECT 1 FROM academy_fee_plans f WHERE f.id=academy_admissions.fee_plan_id",
        "AND f.active=1 AND f.offering_id=academy_admissions.offering_id)",
        "AND EXISTS (SELECT 1 FROM academy_batches b WHERE b.id=academy_admissions.batch_id",
        "AND b.offering_id=academy_admissions.offering_id AND b.status='ACTIVE')"
      ].join(" ")).bind(id,data.expectedVersion),
      env.DB.prepare([
        "INSERT INTO academy_admission_bills",
        "(id,admission_id,reference,monthly_amount_paisa,admission_amount_paisa,amount_paisa,issue_on,issued_by)",
        "SELECT ?,a.id,?,f.monthly_amount_paisa,f.admission_amount_paisa,",
        "(f.monthly_amount_paisa+f.admission_amount_paisa),date('now'),?",
        "FROM academy_admissions a JOIN academy_fee_plans f ON f.id=a.fee_plan_id",
        "WHERE a.id=? AND a.status='BILLED' AND a.version=? AND changes()=1"
      ].join(" ")).bind(billId,reference,staff.userId,id,data.expectedVersion+1),
      env.DB.prepare([
        "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,after_json)",
        "SELECT ?,'admission',?,'INITIAL_BILL_ISSUED',?,?,? WHERE changes()=1"
      ].join(" ")).bind(crypto.randomUUID(),id,staff.userId,data.reason,
        JSON.stringify({reference,version:data.expectedVersion+1})),
    ]);
    if(tx.some(x=>x.meta.changes!==1)){
      return privateJson({error:"Application, batch or fee plan changed; refresh"},409);
    }
    return privateJson({ok:true,reference,status:"BILLED",version:data.expectedVersion+1});
  }catch{return privateJson({error:"Unable to issue bill or it was already issued"},409);}
}
