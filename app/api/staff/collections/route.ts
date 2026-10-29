import {env} from "cloudflare:workers";
import {getStaffAccess,privateJson,sameOrigin} from "@/lib/staff-access";
import {collectionInput,type CollectionInvoice,type CollectionReceipt} from "@/lib/erp-collections";
export const dynamic="force-dynamic";
const authorized=(role:string)=>["OWNER","ADMIN","OPERATOR"].includes(role);
export async function GET(request:Request){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(!authorized(staff.role))return privateJson({error:"Access denied"},403);
  try{
    const [invoices,receipts]=await Promise.all([
      env.DB.prepare([
        "SELECT i.id,i.invoice_no,i.student_id,s.student_no,s.full_name AS student_name,",
        "i.issue_on,i.amount_paisa,i.paid_paisa,i.status",
        "FROM finance_invoices i JOIN academy_students s ON s.id=i.student_id",
        "WHERE i.status IN ('ISSUED','PARTIAL','PAID')",
        "ORDER BY i.created_at DESC,i.id DESC LIMIT 200"
      ].join(" ")).all<CollectionInvoice>(),
      env.DB.prepare([
        "SELECT p.id,p.receipt_no,i.invoice_no,s.full_name AS student_name,p.amount_paisa,",
        "p.payment_method,p.received_at,p.reference",
        "FROM finance_payments p JOIN finance_allocations a ON a.payment_id=p.id",
        "JOIN finance_invoices i ON i.id=a.invoice_id",
        "JOIN academy_students s ON s.id=p.student_id",
        "ORDER BY p.received_at DESC,p.id DESC LIMIT 100"
      ].join(" ")).all<CollectionReceipt>(),
    ]);
    return privateJson({invoices:invoices.results??[],receipts:receipts.results??[]});
  }catch{return privateJson({error:"Collections unavailable"},503);}
}
export async function POST(request:Request){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(!authorized(staff.role))return privateJson({error:"Access denied"},403);
  if(!sameOrigin(request))return privateJson({error:"Invalid request origin"},403);
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")){
    return privateJson({error:"JSON required"},415);
  }
  let body:unknown;
  try{const raw=await request.text();if(raw.length>2500)return privateJson({error:"Request too large"},413);body=JSON.parse(raw);}
  catch{return privateJson({error:"Invalid JSON"},400);}
  const parsed=collectionInput.safeParse(body);
  if(!parsed.success)return privateJson({error:"Check amount, method, invoice and reason"},400);
  const data=parsed.data,paymentId=crypto.randomUUID(),allocationId=crypto.randomUUID();
  const receiptNo="SA-RCPT-"+crypto.randomUUID().replace(/-/g,"").slice(0,12).toUpperCase();
  try{
    // The triggers enforce invoice ownership, outstanding balance and balanced GL.
    // D1.batch rolls back the receipt when any allocation or journal entry fails.
    const tx=await env.DB.batch([
      env.DB.prepare([
        "INSERT INTO finance_payments",
        "(id,receipt_no,student_id,amount_paisa,payment_method,received_by,reference)",
        "SELECT ?,?,i.student_id,?,?,?,? FROM finance_invoices i",
        "WHERE i.id=? AND i.status IN ('ISSUED','PARTIAL')",
        "AND i.amount_paisa-i.paid_paisa>=?"
      ].join(" ")).bind(paymentId,receiptNo,data.amountPaisa,data.method,
        staff.userId,data.reference||null,data.invoiceId,data.amountPaisa),
      env.DB.prepare([
        "INSERT INTO finance_allocations(id,payment_id,invoice_id,amount_paisa)",
        "SELECT ?,?,?,? WHERE changes()=1"
      ].join(" ")).bind(allocationId,paymentId,data.invoiceId,data.amountPaisa),
      env.DB.prepare([
        "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,after_json)",
        "SELECT ?,'finance_payment',?,'RECEIVED_AND_ALLOCATED',?,?,? WHERE changes()=1"
      ].join(" ")).bind(crypto.randomUUID(),paymentId,staff.userId,data.reason,
        JSON.stringify({receiptNo,invoiceId:data.invoiceId,amountPaisa:data.amountPaisa,method:data.method})),
    ]);
    if(tx.some(x=>x.meta.changes!==1)){
      return privateJson({error:"Invoice already settled or amount exceeds outstanding"},409);
    }
    return privateJson({ok:true,id:paymentId,receiptNo,allocatedPaisa:data.amountPaisa},201);
  }catch{return privateJson({error:"Payment not posted. Nothing was collected in the ERP; verify the invoice and retry."},409);}
}
