import {env} from "cloudflare:workers";
import {privateJson,sameOrigin} from "@/lib/staff-access";
import type {ExpenseRow} from "@/lib/erp-expenses";
import {getCommandAccess} from "@/modules/platform/auth/command-access";
import {POST_OPERATING_EXPENSE_PERMISSION,recordOperatingExpense} from "@/modules/finance/expenses/commands";

export const dynamic="force-dynamic";
export async function GET(request:Request){
  const staff=await getCommandAccess(request);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(!staff.permissions.includes(POST_OPERATING_EXPENSE_PERMISSION))return privateJson({error:"Access denied"},403);
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
  const staff=await getCommandAccess(request);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(!staff.permissions.includes(POST_OPERATING_EXPENSE_PERMISSION))return privateJson({error:"Expense posting permission required"},403);
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
  const result=await recordOperatingExpense(env.DB,staff,body);
  if(!result.ok)return privateJson({error:result.error},result.status);
  return privateJson(result,result.replayed?200:201);
}

