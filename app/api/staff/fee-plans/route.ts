import {env} from "cloudflare:workers";
import {getStaffAccess,privateJson,sameOrigin} from "@/lib/staff-access";
import {createFeePlan,type FeePlanRow} from "@/lib/erp-fee-plans";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  try{
    const [plans,offerings]=await Promise.all([
      env.DB.prepare([
        "SELECT f.id,f.offering_id,p.name AS offering_name,f.title,",
        "f.monthly_amount_paisa,f.admission_amount_paisa,f.active,f.version",
        "FROM academy_fee_plans f JOIN public_programme_offerings p ON p.id=f.offering_id",
        "ORDER BY p.name,f.active DESC,f.title LIMIT 200"
      ].join(" ")).all<FeePlanRow>(),
      env.DB.prepare("SELECT id,name FROM public_programme_offerings ORDER BY name LIMIT 150").all<{id:string;name:string}>(),
    ]);
    return privateJson({items:plans.results??[],offerings:offerings.results??[],
      canEdit:["OWNER","ADMIN"].includes(staff.role)});
  }catch{return privateJson({error:"Fee plans unavailable"},503);}
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
    const raw=await request.text();if(raw.length>2000)return privateJson({error:"Request too large"},413);
    body=JSON.parse(raw);
  }catch{return privateJson({error:"Invalid JSON"},400);}
  const parsed=createFeePlan.safeParse(body);
  if(!parsed.success)return privateJson({error:"Invalid fee amounts or plan details"},400);
  const data=parsed.data,id=crypto.randomUUID();
  try{
    const result=await env.DB.batch([
      env.DB.prepare([
        "INSERT INTO academy_fee_plans",
        "(id,offering_id,title,monthly_amount_paisa,admission_amount_paisa,active)",
        "SELECT ?,?,?,?,?,1 WHERE EXISTS(SELECT 1 FROM public_programme_offerings WHERE id=?)"
      ].join(" ")).bind(id,data.offeringId,data.title,data.monthlyAmountPaisa,
        data.admissionAmountPaisa,data.offeringId),
      env.DB.prepare([
        "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,after_json)",
        "SELECT ?,'academy_fee_plan',?,'CREATED',?,?,? WHERE changes()=1"
      ].join(" ")).bind(crypto.randomUUID(),id,staff.userId,data.reason,JSON.stringify(data)),
    ]);
    if(result[0].meta.changes!==1||result[1].meta.changes!==1){
      return privateJson({error:"Programme offering does not exist"},409);
    }
    return privateJson({ok:true,id,version:1},201);
  }catch{return privateJson({error:"Could not save fee plan"},503);}
}
