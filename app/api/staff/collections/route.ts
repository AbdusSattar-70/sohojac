import {env} from "cloudflare:workers";
import {privateJson,sameOrigin} from "@/lib/staff-access";
import {getCommandAccess} from "@/modules/platform/auth/command-access";
import {collectionInput,type CollectionInvoice,type CollectionReceipt} from "@/lib/erp-collections";
import {recordStudentPayment,findStudentPaymentResult} from "@/modules/finance/payments/record-payment";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 let actor;
 try{actor=await getCommandAccess(request);}catch{return privateJson({error:"Permissions are unavailable"},503);}
 if(!actor)return privateJson({error:"Authentication required"},401);
 const requestId=new URL(request.url).searchParams.get("requestId");
 if(requestId!==null){
  try{
   const result=await findStudentPaymentResult(env.DB,actor,requestId);
   if(!result)return privateJson({state:"UNCONFIRMED",message:"Retry this same request to confirm its outcome."});
   if(!result.ok)return privateJson({error:result.message,code:result.code},result.code==="FORBIDDEN"?403:result.code==="INVALID"?400:409);
   return privateJson({state:"POSTED",...result});
  }catch{return privateJson({error:"Payment outcome is unavailable. Keep the same request ID."},503);}
 }
 if(!actor.permissions.includes("finance.view"))return privateJson({error:"Finance viewing permission required"},403);
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
    return privateJson({invoices:invoices.results??[],receipts:receipts.results??[],actorId:actor.profileId,canPost:actor.permissions.includes("finance.payments.post")});
  }catch{return privateJson({error:"Collections unavailable"},503);}
}

export async function POST(request:Request){
 let actor;
 try{actor=await getCommandAccess(request);}catch{return privateJson({error:"Permissions are unavailable"},503);}
 if(!actor)return privateJson({error:"Authentication required"},401);
 if(!actor.permissions.includes("finance.payments.post"))return privateJson({error:"Payment posting permission required"},403);
 if(!sameOrigin(request))return privateJson({error:"Invalid request origin"},403);
 if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))return privateJson({error:"JSON required"},415);
 let body:unknown;
 try{const raw=await request.text();if(raw.length>2500)return privateJson({error:"Request too large"},413);body=JSON.parse(raw);}
 catch{return privateJson({error:"Invalid JSON"},400);}
 if(!body||typeof body!=="object"||Array.isArray(body))return privateJson({error:"Payment details required"},400);
 const values=body as Record<string,unknown>,headerId=request.headers.get("idempotency-key");
 if(values.requestId===undefined&&!headerId)return privateJson({error:"Refresh the collections page before recording this payment."},400);
 if(headerId&&values.requestId!==undefined&&values.requestId!==headerId)return privateJson({error:"Payment request IDs do not match"},400);
 const parsed=collectionInput.safeParse({...values,requestId:values.requestId??headerId??undefined});
 if(!parsed.success)return privateJson({error:"Check the amount, method, invoice and reason. Refresh the page if the payment cannot be submitted."},400);
 const result=await recordStudentPayment(env.DB,actor,parsed.data);
 if(!result.ok)return privateJson({error:result.message,code:result.code},
  result.code==="INVALID"?400:result.code==="FORBIDDEN"?403:result.code==="UNAVAILABLE"?503:409);
 return privateJson(result,result.replayed?200:201);
}
