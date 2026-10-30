import type { CommandActor } from "@/modules/platform/auth/command-access";

type Database = Pick<D1Database, "prepare">;
export type RecordPaymentInput = {
 requestId: string; invoiceId?: string; admissionId?: string;
 amountPaisa: number; method: "CASH" | "BANK" | "MFS"; reference?: string; reason: string;
};
export type PaymentResult =
 | {ok:true;id:string;receiptNo:string;invoiceId:string;allocatedPaisa:number;
    remainingDuePaisa:number|null;receivedAt:string;replayed:boolean}
 | {ok:false;code:"INVALID"|"FORBIDDEN"|"CONFLICT"|"BALANCE"|"UNAVAILABLE";message:string};
type Stored = {actor_id:string;payload_hash:string;payload_json:string;payment_id:string;receipt_no:string;
 invoice_id:string;amount_paisa:number;remaining_due_paisa:number;received_at:string};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const keys = new Set(["requestId","invoiceId","admissionId","amountPaisa","method","reference","reason"]);
function normalize(input:unknown): RecordPaymentInput | null {
 if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).some(k=>!keys.has(k)))return null;
 const x=input as Record<string,unknown>;
 if(typeof x.requestId!=="string"||!uuid.test(x.requestId)||
   (typeof x.invoiceId!=="string"&&typeof x.admissionId!=="string")||
   (x.invoiceId!==undefined&&x.admissionId!==undefined)||
   (x.invoiceId!==undefined&&!uuid.test(String(x.invoiceId)))||
   (x.admissionId!==undefined&&!uuid.test(String(x.admissionId)))||
   !Number.isSafeInteger(x.amountPaisa)||Number(x.amountPaisa)<1||Number(x.amountPaisa)>200000000||
   !["CASH","BANK","MFS"].includes(String(x.method))||
   (x.reference!==undefined&&typeof x.reference!=="string")||
   typeof x.reason!=="string"||x.reason.trim().length<5||x.reason.trim().length>500||
   String(x.reference??"").trim().length>160)return null;
 return {requestId:x.requestId,invoiceId:x.invoiceId as string|undefined,admissionId:x.admissionId as string|undefined,
  amountPaisa:Number(x.amountPaisa),method:x.method as RecordPaymentInput["method"],
  reference:String(x.reference??"").trim(),reason:x.reason.trim()};
}
function storedResult(row:Stored,replayed:boolean):PaymentResult {
 return {ok:true,id:row.payment_id,receiptNo:row.receipt_no,invoiceId:row.invoice_id,
  allocatedPaisa:row.amount_paisa,remainingDuePaisa:row.remaining_due_paisa,receivedAt:row.received_at,replayed};
}
const conflict=():PaymentResult=>({ok:false,code:"CONFLICT",message:"This request is already linked to a different payment. Review the original receipt."});
async function previous(db:Database,requestId:string,actor:string,payload:string,hash:string):Promise<PaymentResult|null>{
 const row=await db.prepare("SELECT * FROM finance_payment_commands WHERE request_id=?").bind(requestId).first<Stored>();
 if(!row)return null;
 return row.actor_id===actor&&row.payload_json===payload&&row.payload_hash===hash?storedResult(row,true):conflict();
}
async function legacy(db:Database,v:RecordPaymentInput,actor:string):Promise<PaymentResult|null>{
 const old=await db.prepare([
  "SELECT k.actor_id,k.admission_id,p.id,p.receipt_no,p.amount_paisa,p.payment_method,p.reference,p.received_at,",
  "a.invoice_id,a.amount_paisa AS allocation_amount,",
  "(SELECT e.reason FROM erp_audit_events e WHERE e.entity_type='finance_payment' AND e.entity_id=p.id",
  "AND e.action='RECEIVED_AND_ALLOCATED' ORDER BY e.occurred_at,e.id LIMIT 1) AS posting_reason",
  "FROM academy_admission_collection_keys k JOIN finance_payments p ON p.id=k.payment_id",
  "JOIN finance_allocations a ON a.payment_id=p.id WHERE k.request_id=?"
 ].join(" ")).bind(v.requestId).all<{actor_id:string;admission_id:string;id:string;receipt_no:string;
  amount_paisa:number;payment_method:string;reference:string|null;received_at:string;invoice_id:string;
  allocation_amount:number;posting_reason:string|null}>();
 const rows=old.results??[];if(!rows.length)return null;
 const r=rows[0];
 if(rows.length!==1||r.actor_id!==actor||(v.admissionId&&r.admission_id!==v.admissionId)||
  (v.invoiceId&&r.invoice_id!==v.invoiceId)||r.amount_paisa!==v.amountPaisa||
  r.allocation_amount!==v.amountPaisa||r.payment_method!==v.method||
  (r.reference??"")!==(v.reference??"")||r.posting_reason!==v.reason)return conflict();
 return {ok:true,id:r.id,receiptNo:r.receipt_no,invoiceId:r.invoice_id,allocatedPaisa:r.amount_paisa,
  remainingDuePaisa:null,receivedAt:r.received_at,replayed:true};
}
/** The only student-payment write command. Both HTTP and admission actions call
 * it with a freshly authenticated actor. One SQLite statement atomically records
 * the durable request, receipt, allocation, audit and verified balanced journal.
 */
export async function recordStudentPayment(db:Database,actor:CommandActor|null,input:unknown):Promise<PaymentResult>{
 if(!actor?.permissions.includes("finance.payments.post"))return {ok:false,code:"FORBIDDEN",message:"Payment posting permission required."};
 const v=normalize(input);
 if(!v)return {ok:false,code:"INVALID",message:"A request ID, invoice, positive whole-paisa amount, payment method and reason are required."};
 const payload=JSON.stringify({invoiceId:v.invoiceId??null,admissionId:v.admissionId??null,
  amountPaisa:v.amountPaisa,method:v.method,reference:v.reference,reason:v.reason});
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(payload))))
  .map(b=>b.toString(16).padStart(2,"0")).join("");
 try{
  const found=await previous(db,v.requestId,actor.profileId,payload,hash)??await legacy(db,v,actor.profileId);
  if(found)return found;
  const paymentId=crypto.randomUUID(),allocationId=crypto.randomUUID(),auditId=crypto.randomUUID();
  const receiptNo="SA-RCPT-"+crypto.randomUUID().replaceAll("-","").slice(0,12).toUpperCase();
  await db.prepare([
   "INSERT INTO finance_payment_commands(request_id,actor_id,payload_hash,payload_json,payment_id,allocation_id,audit_id,",
   "invoice_id,admission_id,receipt_no,amount_paisa,payment_method,reference,reason,remaining_due_paisa)",
   "SELECT ?,?,?,?,?,?,?,i.id,i.admission_id,?,?,?,?,?,i.amount_paisa-i.paid_paisa-?",
   "FROM finance_invoices i WHERE ((? IS NOT NULL AND i.id=?) OR (? IS NOT NULL AND i.admission_id=?))",
   "AND i.status IN ('ISSUED','PARTIAL') AND i.amount_paisa-i.paid_paisa>=?",
   "ORDER BY i.issue_on,i.created_at,i.id LIMIT 1 ON CONFLICT(request_id) DO NOTHING RETURNING request_id"
  ].join(" ")).bind(v.requestId,actor.profileId,hash,payload,paymentId,allocationId,auditId,
    receiptNo,v.amountPaisa,v.method,v.reference||null,v.reason,v.amountPaisa,
    v.invoiceId??null,v.invoiceId??null,v.admissionId??null,v.admissionId??null,v.amountPaisa).all();
  const saved=await previous(db,v.requestId,actor.profileId,payload,hash);
  if(saved?.ok)return {...saved,replayed:saved.id!==paymentId};
  return saved??{ok:false,code:"BALANCE",message:"Invoice is settled or the amount exceeds its outstanding balance. Review the invoice before posting."};
 }catch{
  // D1 may have committed even if the response was lost. Never mint a new key.
  try{
   const saved=await previous(db,v.requestId,actor.profileId,payload,hash)??await legacy(db,v,actor.profileId);
   if(saved)return saved;
  }catch{}
  return {ok:false,code:"UNAVAILABLE",message:"Payment could not be confirmed. Review receipts or retry this same request; do not record a second payment."};
 }
}

export async function findStudentPaymentResult(db:Database,actor:CommandActor|null,requestId:string):Promise<PaymentResult|null>{
 if(!actor?.permissions.includes("finance.payments.post"))return {ok:false,code:"FORBIDDEN",message:"Payment posting permission required."};
 if(!uuid.test(requestId))return {ok:false,code:"INVALID",message:"Invalid payment request ID."};
 const row=await db.prepare("SELECT * FROM finance_payment_commands WHERE request_id=?").bind(requestId).first<Stored>();
 if(row)return row.actor_id===actor.profileId?storedResult(row,true):conflict();
 const old=await db.prepare([
  "SELECT k.actor_id,p.id,p.receipt_no,p.amount_paisa,p.received_at,a.invoice_id",
  "FROM academy_admission_collection_keys k JOIN finance_payments p ON p.id=k.payment_id",
  "JOIN finance_allocations a ON a.payment_id=p.id WHERE k.request_id=?"
 ].join(" ")).bind(requestId).first<{actor_id:string;id:string;receipt_no:string;amount_paisa:number;received_at:string;invoice_id:string}>();
 if(!old)return null;
 return old.actor_id===actor.profileId?{ok:true,id:old.id,receiptNo:old.receipt_no,invoiceId:old.invoice_id,
  allocatedPaisa:old.amount_paisa,remainingDuePaisa:null,receivedAt:old.received_at,replayed:true}:conflict();
}
