import {env} from "cloudflare:workers";
import {getStaffAccess,privateJson,sameOrigin} from "@/lib/staff-access";
import {expenseInput,type ExpenseRow} from "@/lib/erp-expenses";

export const dynamic="force-dynamic";
const canPost=(role:string)=>role==="OWNER"||role==="ADMIN";
export async function GET(request:Request){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(!canPost(staff.role))return privateJson({error:"Access denied"},403);
  try{
    const result=await env.DB.prepare([
      "SELECT e.id,e.reference,e.category,e.payee,e.description,e.spent_on,",
      "e.amount_paisa,e.payment_method,u.name AS approved_name,e.created_at",
      "FROM finance_operating_expenses e LEFT JOIN \"user\" u ON u.id=e.approved_by",
      "ORDER BY e.spent_on DESC,e.created_at DESC LIMIT 200"
    ].join(" ")).all<ExpenseRow>();
    const totals=await env.DB.prepare([
      "SELECT category,SUM(amount_paisa) AS amount_paisa",
      "FROM finance_operating_expenses GROUP BY category ORDER BY category"
    ].join(" ")).all<{category:string;amount_paisa:number}>();
    return privateJson({items:result.results??[],totals:totals.results??[]});
  }catch{return privateJson({error:"Expense register unavailable"},503);}
}
export async function POST(request:Request){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(!canPost(staff.role))return privateJson({error:"Only owners or administrators can post expenses"},403);
  if(!sameOrigin(request))return privateJson({error:"Invalid request origin"},403);
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")){
    return privateJson({error:"JSON required"},415);
  }
  let body:unknown;
  try{
    const raw=await request.text();
    if(raw.length>3000)return privateJson({error:"Request too large"},413);
    body=JSON.parse(raw);
  }catch{return privateJson({error:"Invalid JSON"},400);}
  const parsed=expenseInput.safeParse(body);
  if(!parsed.success)return privateJson({error:"Check expense details, amounts and date"},400);
  const data=parsed.data,id=crypto.randomUUID();
  const reference="SA-EXP-"+crypto.randomUUID().replace(/-/g,"").slice(0,12).toUpperCase();
  try{
    const result=await env.DB.batch([
      env.DB.prepare([
        "INSERT INTO finance_operating_expenses",
        "(id,reference,category,payee,description,spent_on,amount_paisa,payment_method,approved_by)",
        "SELECT ?,?,?,?,?,?,?,?,? WHERE ?<=date('now') RETURNING id"
      ].join(" ")).bind(id,reference,data.category,data.payee,data.description,
        data.spentOn,data.amountPaisa,data.method,staff.userId,data.spentOn),
      env.DB.prepare([
        "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,after_json)",
        "SELECT ?,'finance_expense',?,'POSTED',?,?,? WHERE changes()=1 RETURNING id"
      ].join(" ")).bind(crypto.randomUUID(),id,staff.userId,data.reason,
        JSON.stringify({reference,category:data.category,spentOn:data.spentOn,
          amountPaisa:data.amountPaisa,method:data.method})),
    ]);
    if(result.some(x=>(x.results?.length??0)!==1)){
      return privateJson({error:"Expense date is in the future or expense was not posted"},409);
    }
    return privateJson({ok:true,reference},201);
  }catch{
    return privateJson({error:"Expense was not posted. Check amount and ledger integrity."},409);
  }
}
