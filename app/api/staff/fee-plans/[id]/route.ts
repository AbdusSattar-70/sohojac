import {env} from "cloudflare:workers";
import {getStaffAccess,privateJson,sameOrigin} from "@/lib/staff-access";
import {updateFeePlan} from "@/lib/erp-fee-plans";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
type Existing={id:string;title:string;monthly_amount_paisa:number;admission_amount_paisa:number;active:number;version:number};
export async function PATCH(request:Request,context:Context){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(!["OWNER","ADMIN"].includes(staff.role))return privateJson({error:"Access denied"},403);
  if(!sameOrigin(request))return privateJson({error:"Invalid request origin"},403);
  const {id}=await context.params;
  if(!/^[0-9a-f-]{36}$/i.test(id))return privateJson({error:"Invalid plan ID"},400);
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")){
    return privateJson({error:"JSON required"},415);
  }
  let body:unknown;
  try{
    const raw=await request.text();if(raw.length>2000)return privateJson({error:"Request too large"},413);
    body=JSON.parse(raw);
  }catch{return privateJson({error:"Invalid JSON"},400);}
  const parsed=updateFeePlan.safeParse(body);
  if(!parsed.success)return privateJson({error:"Invalid price, status or reason"},400);
  const data=parsed.data;
  try{
    const current=await env.DB.prepare([
      "SELECT id,title,monthly_amount_paisa,admission_amount_paisa,active,version",
      "FROM academy_fee_plans WHERE id=?"
    ].join(" ")).bind(id).first<Existing>();
    if(!current)return privateJson({error:"Fee plan not found"},404);
    if(current.version!==data.expectedVersion)return privateJson({error:"Fee plan changed; refresh"},409);
    const result=await env.DB.batch([
      env.DB.prepare([
        "UPDATE academy_fee_plans SET title=?,monthly_amount_paisa=?,admission_amount_paisa=?,",
        "active=?,version=version+1 WHERE id=? AND version=?"
      ].join(" ")).bind(data.title,data.monthlyAmountPaisa,data.admissionAmountPaisa,
        data.active?1:0,id,data.expectedVersion),
      env.DB.prepare([
        "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,before_json,after_json)",
        "SELECT ?,'academy_fee_plan',?,'UPDATED',?,?,?,? WHERE changes()=1"
      ].join(" ")).bind(crypto.randomUUID(),id,staff.userId,data.reason,
        JSON.stringify(current),JSON.stringify({...data,version:data.expectedVersion+1})),
    ]);
    if(result[0].meta.changes!==1||result[1].meta.changes!==1){
      return privateJson({error:"Fee plan changed; refresh and retry"},409);
    }
    return privateJson({ok:true,version:data.expectedVersion+1});
  }catch{return privateJson({error:"Could not update fee plan"},503);}
}
