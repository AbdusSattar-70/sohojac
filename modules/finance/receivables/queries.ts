import {env} from "cloudflare:workers";
import {z} from "zod";
import {requirePermission} from "@/modules/platform/auth/erp-context";

export type ReceivableRow={
 id:string;invoice_no:string;student_id:string;admission_id:string|null;
 student_no:string;full_name:string;guardian:string;mobile:string;
 issued_on:string;due_on:string|null;billed:number;paid:number;due:number;
 age_days:number;bucket:string;promise_id:string|null;promise_amount:number|null;
 promise_due:string|null;promise_revision:number|null;promise_collected:number|null;
 last_contact:string|null;
};
export type ReceivableData={
 today:string;total:number;canManage:boolean;
 summary:{bucket:string;amount:number}[];rows:ReceivableRow[];
};
type Raw=Omit<ReceivableRow,"billed"|"paid"|"due"|"promise_amount"|"promise_collected">&{
 amount_paisa:number;paid_paisa:number;due_paisa:number;
 promise_amount_paisa:number|null;promise_collected_paisa:number|null;
};
const base=[
 "WITH receivables AS (SELECT i.id,i.invoice_no,i.student_id,i.admission_id,",
 "s.student_no,s.full_name,s.guardian_name AS guardian,s.guardian_mobile AS mobile,",
 "i.issue_on AS issued_on,i.due_on,i.amount_paisa,i.paid_paisa,",
 "(i.amount_paisa-i.paid_paisa) AS due_paisa,",
 "CASE WHEN i.due_on IS NULL THEN 0 ELSE MAX(CAST(julianday(date('now','+6 hours'))-julianday(i.due_on) AS INTEGER),0) END AS age_days,",
 "CASE WHEN i.due_on IS NULL OR i.due_on>=date('now','+6 hours') THEN 'NOT_DUE'",
 "WHEN julianday(date('now','+6 hours'))-julianday(i.due_on)<=30 THEN '1_30'",
 "WHEN julianday(date('now','+6 hours'))-julianday(i.due_on)<=60 THEN '31_60'",
 "WHEN julianday(date('now','+6 hours'))-julianday(i.due_on)<=90 THEN '61_90' ELSE '90_PLUS' END AS bucket,",
 "p.id AS promise_id,p.amount_paisa AS promise_amount_paisa,p.due_on AS promise_due,p.revision AS promise_revision,",
 "CASE WHEN p.id IS NULL THEN NULL ELSE MAX(COALESCE((SELECT SUM(a.amount_paisa) FROM finance_allocations a",
 "JOIN finance_payments pay ON pay.id=a.payment_id AND pay.student_id=i.student_id",
 "WHERE a.invoice_id=i.id),0)-p.baseline_paid_paisa,0) END AS promise_collected_paisa,",
 "(SELECT MAX(e.created_at) FROM finance_collection_events e WHERE e.invoice_id=i.id AND e.action='CONTACT') AS last_contact",
 "FROM finance_invoices i JOIN academy_students s ON s.id=i.student_id",
 "LEFT JOIN finance_collection_promises p ON p.invoice_id=i.id AND p.status='OPEN'",
 "WHERE i.status IN ('ISSUED','PARTIAL','PAID') AND (? IS NULL OR i.student_id=?))"
].join(" ");

/** Original receivable workspace filters/pagination on actual posted D1 balances.
 * Missing due dates stay NOT_DUE. Guardian statements include settled invoices;
 * summary totals cover the selected account independently of table filters.
 */
export async function getReceivables(
 page=1,search="",bucket="ALL",promises=false,studentId?:string
):Promise<ReceivableData>{
 const context=await requirePermission("finance.view");
 if(!Number.isInteger(page)||page<1||page>10000||search.length>100||
  !["ALL","NOT_DUE","1_30","31_60","61_90","90_PLUS"].includes(bucket)||
  (studentId!==undefined&&!z.string().uuid().safeParse(studentId).success))
  throw Error("Invalid receivable filters.");
 const needle=search.trim();
 const where=[
  " WHERE (due_paisa>0 OR ? IS NOT NULL) AND (?='ALL' OR bucket=?)",
  "AND (?=0 OR promise_due<=date('now','+6 hours'))",
  "AND (?='' OR instr(lower(full_name),lower(?))>0 OR instr(lower(student_no),lower(?))>0",
  "OR instr(lower(invoice_no),lower(?))>0 OR instr(mobile,?)>0)"
 ].join(" ");
 const scope=[studentId??null,studentId??null];
 const filters=[studentId??null,bucket,bucket,promises?1:0,needle,needle,needle,needle,needle];
 const results=await env.DB.batch([
  env.DB.prepare(base+" SELECT * FROM receivables"+where+" ORDER BY due_on IS NULL,due_on,id LIMIT 25 OFFSET ?")
   .bind(...scope,...filters,(page-1)*25),
  env.DB.prepare(base+" SELECT COUNT(*) AS total FROM receivables"+where).bind(...scope,...filters),
  env.DB.prepare(base+" SELECT bucket,SUM(due_paisa) AS amount_paisa FROM receivables WHERE due_paisa>0 GROUP BY bucket").bind(...scope),
  env.DB.prepare("SELECT date('now','+6 hours') AS today")
 ]);
 const rows=(results[0].results??[]) as unknown as Raw[];
 const total=(results[1].results?.[0] as {total:number}|undefined)?.total??0;
 const summary=(results[2].results??[]) as unknown as {bucket:string;amount_paisa:number}[];
 const today=(results[3].results?.[0] as {today:string}|undefined)?.today;
 if(!today)throw Error("Current academy date unavailable.");
 return {
  today,total,canManage:context.permissions.includes("finance.payments.post"),
  summary:summary.map(row=>({bucket:row.bucket,amount:row.amount_paisa/100})),
  rows:rows.map(({amount_paisa,paid_paisa,due_paisa,promise_amount_paisa,promise_collected_paisa,...row})=>({
   ...row,billed:amount_paisa/100,paid:paid_paisa/100,due:due_paisa/100,
   promise_amount:promise_amount_paisa===null?null:promise_amount_paisa/100,
   promise_collected:promise_collected_paisa===null?null:promise_collected_paisa/100
  }))
 };
}
