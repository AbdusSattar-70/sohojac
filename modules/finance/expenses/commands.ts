import {expenseInput} from "@/lib/erp-expenses";

export const POST_OPERATING_EXPENSE_PERMISSION="accounting.expenses.post";
export type ExpenseCommandActor={profileId:string;permissions:readonly string[]};
export type ExpenseCommandResult=
  | {ok:true;id:string;reference:string;replayed:boolean}
  | {ok:false;status:400|401|403|409|503;error:string};
type ExpenseCommandRow={actor_id:string;payload_hash:string;expense_id:string;reference:string};

/** The only application writer for an operating expense and its posting evidence. */
export async function recordOperatingExpense(
  db:D1Database,actor:ExpenseCommandActor|null,input:unknown,
):Promise<ExpenseCommandResult>{
  if(!actor)return {ok:false,status:401,error:"Authentication required"};
  if(!actor.permissions.includes(POST_OPERATING_EXPENSE_PERMISSION)){
    return {ok:false,status:403,error:"Expense posting permission required"};
  }
  const parsed=expenseInput.safeParse(input);
  if(!parsed.success)return {ok:false,status:400,error:"Check expense details, amount, date and request identity"};
  const {requestId,...payload}=parsed.data;
  // Schema output has a stable field order and normalized text. Every business
  // field, including the posting reason, belongs to the same immutable request.
  const payloadJson=JSON.stringify(payload);
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(payloadJson));
  const payloadHash=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");
  const lookup=()=>db.prepare(
    "SELECT actor_id,payload_hash,expense_id,reference FROM finance_expense_command_keys WHERE request_id=?"
  ).bind(requestId).first<ExpenseCommandRow>();
  const result=(row:ExpenseCommandRow,replayed:boolean):ExpenseCommandResult=>
    row.actor_id===actor.profileId&&row.payload_hash===payloadHash
      ? {ok:true,id:row.expense_id,reference:row.reference,replayed}
      : {ok:false,status:409,error:"This request identity already belongs to another expense or operator"};
  try{
    const previous=await lookup();
    if(previous)return result(previous,true);
    const id=crypto.randomUUID();
    const reference="SA-EXP-"+id.replace(/-/g,"").toUpperCase();
    // D1 batch is transactional. The INSERT trigger writes the expense, its
    // existing double-entry journal, and audit, then asserts all posting evidence.
    // The unique request key is reserved in that same transaction, so concurrent
    // retries cannot both create an expense. A mismatch never modifies the key.
    await db.batch([
      db.prepare([
        "INSERT INTO finance_expense_command_keys",
        "(request_id,actor_id,payload_hash,payload_json,expense_id,reference,audit_id)",
        "VALUES(?,?,?,?,?,?,?) ON CONFLICT(request_id) DO NOTHING",
      ].join(" ")).bind(requestId,actor.profileId,payloadHash,payloadJson,id,reference,crypto.randomUUID()),
    ]);
    const saved=await lookup();
    if(saved)return result(saved,saved.expense_id!==id);
    return {ok:false,status:503,error:"Expense outcome is unavailable. Retry the same expense without changing its details."};
  }catch{
    // A timeout may follow a successful commit. Recover the durable result before
    // telling the caller to retry, always using the original request identity.
    try{const saved=await lookup();if(saved)return result(saved,true);}catch{}
    return {ok:false,status:503,error:"Expense outcome is unconfirmed. Retry the same expense without changing its details."};
  }
}
