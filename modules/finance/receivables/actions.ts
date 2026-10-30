"use server";
import {env} from "cloudflare:workers";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {getErpContext} from "@/modules/platform/auth/erp-context";

const schema=z.object({
 action:z.enum(["PROMISE","COMPLETE","CANCEL","CONTACT"]),request_id:z.string().uuid(),
 invoice_id:z.string().uuid(),id:z.string().uuid().optional(),
 revision:z.number().int().positive().optional(),
 amount:z.coerce.number().finite().positive().max(9999999999.99).optional(),
 due_on:z.iso.date().optional(),reason:z.string().trim().min(5).max(1000)
}).strict();
type Outcome={ok:boolean;message:string;id?:string};
type Key={actor_id:string;payload_json:string;result_json:string};
async function previous(requestId:string,actor:string,payload:string):Promise<Outcome|null>{
 const key=await env.DB.prepare("SELECT actor_id,payload_json,result_json FROM finance_collection_command_keys WHERE request_id=?")
  .bind(requestId).first<Key>();
 if(!key)return null;
 if(key.actor_id!==actor||key.payload_json!==payload)
  return {ok:false,message:"Request identity conflict. Review the saved follow-up before retrying."};
 return {ok:true,...JSON.parse(key.result_json) as {id:string;message:string}};
}
const actualPaid=[
 "COALESCE((SELECT SUM(a.amount_paisa) FROM finance_allocations a",
 "JOIN finance_payments p ON p.id=a.payment_id AND p.student_id=i.student_id",
 "WHERE a.invoice_id=i.id),0)"
].join(" ");

/** Source collection_followup_command, adapted to D1 transactions and named grants.
 * A promise records contact evidence. Completion requires actual allocations
 * received after its captured baseline; no money or fee ledger is changed.
 */
export async function collectionFollowup(input:unknown):Promise<Outcome>{
 const parsed=schema.safeParse(input);
 if(!parsed.success)return {ok:false,message:"Check the contact, commitment, date and reason."};
 const context=await getErpContext();
 if(!context?.permissions.includes("finance.payments.post"))
  return {ok:false,message:"Collection management permission required."};
 const v=parsed.data,actor=context.profileId,payload=JSON.stringify(v);
 let replay:Outcome|null;
 try{replay=await previous(v.request_id,actor,payload);}
 catch{return {ok:false,message:"Collection evidence is unavailable. Refresh before retrying."};}
 if(replay)return replay;
 const closing=v.action==="COMPLETE"||v.action==="CANCEL";
 if(closing&&(!v.id||!v.revision))return {ok:false,message:"Refresh the current open promise."};
 const amountPaisa=v.amount===undefined?0:Math.round(v.amount*100);
 if(v.action==="PROMISE"&&(!v.due_on||!Number.isSafeInteger(amountPaisa)||amountPaisa<1||v.amount!==amountPaisa/100))
  return {ok:false,message:"Enter a positive amount in whole paisa and a current or future promise date."};
 const promiseId=v.action==="PROMISE"?crypto.randomUUID():closing?v.id!:null;
 const eventId=crypto.randomUUID(),resultId=promiseId??v.invoice_id;
 const result={id:resultId,message:"Collection follow-up saved."};
 const statements=[];
 if(v.action==="PROMISE"){
  statements.push(env.DB.prepare([
   "INSERT INTO finance_collection_promises(id,invoice_id,amount_paisa,due_on,baseline_paid_paisa,reason,actor_id)",
   "SELECT ?,i.id,?,?,"+actualPaid+",?,? FROM finance_invoices i",
   "WHERE i.id=? AND i.status IN ('ISSUED','PARTIAL')",
   "AND i.amount_paisa-i.paid_paisa>=? AND ?>=date('now','+6 hours') RETURNING id"
  ].join(" ")).bind(promiseId,amountPaisa,v.due_on!,v.reason,actor,v.invoice_id,amountPaisa,v.due_on!));
 }else if(closing){
  const completion=v.action==="COMPLETE"?"AND "+actualPaid+"-finance_collection_promises.baseline_paid_paisa>=finance_collection_promises.amount_paisa":"";
  statements.push(env.DB.prepare([
   "UPDATE finance_collection_promises SET status=?,revision=revision+1",
   "WHERE id=? AND invoice_id=? AND status='OPEN' AND revision=?",
   "AND EXISTS(SELECT 1 FROM finance_invoices i WHERE i.id=finance_collection_promises.invoice_id",
   "AND i.status IN ('ISSUED','PARTIAL','PAID')",completion,") RETURNING id"
  ].join(" ")).bind(v.action==="COMPLETE"?"COMPLETED":"CANCELLED",promiseId,v.invoice_id,v.revision!));
 }
 statements.push(env.DB.prepare([
  "INSERT INTO finance_collection_events(id,invoice_id,promise_id,action,reason,actor_id)",
  "SELECT ?,i.id,?,?,?,? FROM finance_invoices i WHERE i.id=?",
  "AND i.status IN ('ISSUED','PARTIAL','PAID')",
  v.action==="CONTACT"?"":"AND changes()=1",
  "RETURNING id"
 ].join(" ")).bind(eventId,promiseId,v.action,v.reason,actor,v.invoice_id));
 statements.push(env.DB.prepare([
  "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,after_json)",
  "SELECT ?,'collection_followup',invoice_id,action,actor_id,reason,?",
  "FROM finance_collection_events WHERE id=? AND changes()=1 RETURNING id"
 ].join(" ")).bind(crypto.randomUUID(),JSON.stringify({requestId:v.request_id,promiseId}),eventId));
 statements.push(env.DB.prepare([
  "INSERT INTO finance_collection_command_keys(request_id,invoice_id,actor_id,payload_json,result_json)",
  "SELECT ?,invoice_id,actor_id,?,? FROM finance_collection_events WHERE id=? AND changes()=1 RETURNING request_id"
 ].join(" ")).bind(v.request_id,payload,JSON.stringify(result),eventId));
 try{
  const tx=await env.DB.batch(statements);
  if(tx.some(row=>(row.results?.length??0)!==1))
   return {ok:false,message:"Follow-up not saved. Refresh the invoice balance and current open promise."};
  revalidatePath("/dashboard/finance/receivables");
  return {ok:true,...result};
 }catch{
  try{
   const saved=await previous(v.request_id,actor,payload);
   return saved??{ok:false,message:"Follow-up not saved. Check the balance, date and current commitment before retrying."};
  }catch{return {ok:false,message:"Outcome uncertain. Review the saved follow-up before retrying the same request."};}
 }
}
