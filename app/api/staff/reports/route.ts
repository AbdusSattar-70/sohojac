import {env} from "cloudflare:workers";
import {getStaffAccess,privateJson} from "@/lib/staff-access";
import {reportReconciliationSql} from "@/lib/report-reconciliation-sql";
export const dynamic="force-dynamic";
const monthPattern=/^(20|21)\d{2}-(0[1-9]|1[0-2])$/;
type CountRow={total:number|null};
export async function GET(request:Request){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(!["OWNER","ADMIN"].includes(staff.role))return privateJson({error:"Access denied"},403);
  const academyMonth=()=>{
    const parts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Dhaka",year:"numeric",month:"2-digit"}).formatToParts(new Date());
    return (parts.find(p=>p.type==="year")?.value??"")+"-"+(parts.find(p=>p.type==="month")?.value??"");
  };
  const month=new URL(request.url).searchParams.get("month")||academyMonth();
  if(!monthPattern.test(month))return privateJson({error:"Month must be YYYY-MM"},400);
  try{
    const [
      billed,collected,expenses,outstanding,students,batches,enrollments,
      debit,credit,attendance,postedJournals,unbalancedJournals,unallocatedReceipts,methods,
    ]=await Promise.all([
      env.DB.prepare([
        "SELECT COALESCE(SUM(amount_paisa),0) AS total FROM finance_invoices",
        "WHERE substr(issue_on,1,7)=? AND status!='VOID'"
      ].join(" ")).bind(month).first<CountRow>(),
      env.DB.prepare([
        "SELECT COALESCE(SUM(amount_paisa),0) AS total FROM finance_payments",
        "WHERE substr(received_at,1,7)=?"
      ].join(" ")).bind(month).first<CountRow>(),
      env.DB.prepare([
        "SELECT COALESCE(SUM(amount_paisa),0) AS total FROM finance_operating_expenses",
        "WHERE substr(spent_on,1,7)=?"
      ].join(" ")).bind(month).first<CountRow>(),
      env.DB.prepare([
        "SELECT COALESCE(SUM(amount_paisa-paid_paisa),0) AS total FROM finance_invoices",
        "WHERE status IN ('ISSUED','PARTIAL')"
      ].join(" ")).first<CountRow>(),
      env.DB.prepare("SELECT COUNT(*) AS total FROM academy_students WHERE status='ACTIVE'").first<CountRow>(),
      env.DB.prepare("SELECT COUNT(*) AS total FROM academy_batches WHERE status='ACTIVE'").first<CountRow>(),
      env.DB.prepare([
        "SELECT COUNT(*) AS total FROM academy_enrollments",
        "WHERE status='ACTIVE' AND substr(enrolled_at,1,7)=?"
      ].join(" ")).bind(month).first<CountRow>(),
      env.DB.prepare([
        "SELECT COALESCE(SUM(l.debit_paisa),0) AS total FROM finance_journal_lines l",
        "JOIN finance_journals j ON j.id=l.journal_id WHERE j.status='POSTED'"
      ].join(" ")).first<CountRow>(),
      env.DB.prepare([
        "SELECT COALESCE(SUM(l.credit_paisa),0) AS total FROM finance_journal_lines l",
        "JOIN finance_journals j ON j.id=l.journal_id WHERE j.status='POSTED'"
      ].join(" ")).first<CountRow>(),
      env.DB.prepare([
        "SELECT state,COUNT(*) AS total FROM academy_attendance",
        "WHERE substr(class_on,1,7)=? GROUP BY state"
      ].join(" ")).bind(month).all<{state:string;total:number}>(),
      env.DB.prepare(reportReconciliationSql.postedJournalCount).first<CountRow>(),
      env.DB.prepare(reportReconciliationSql.unbalancedPostedJournals).first<CountRow>(),
      env.DB.prepare(reportReconciliationSql.unallocatedReceipts).first<CountRow>(),
      env.DB.prepare(reportReconciliationSql.paymentMethods).bind(month).all<{method:string;receipts:number;amountPaisa:number}>(),
    ]);
    const money=(x:CountRow|null)=>Number(x?.total??0);
    return privateJson({
      month,
      billedPaisa:money(billed),collectedPaisa:money(collected),
      operatingExpensePaisa:money(expenses),cashMovementPaisa:money(collected)-money(expenses),
      outstandingPaisa:money(outstanding),
      activeStudents:money(students),activeBatches:money(batches),newEnrollments:money(enrollments),
      ledgerDebitsPaisa:money(debit),ledgerCreditsPaisa:money(credit),
      ledgerBalanced:money(debit)===money(credit)&&money(unbalancedJournals)===0,
      postedJournalCount:money(postedJournals),
      unbalancedJournalCount:money(unbalancedJournals),
      unallocatedReceiptCount:money(unallocatedReceipts),
      paymentMethods:methods.results??[],
      attendance:attendance.results??[],
    });
  }catch{return privateJson({error:"Reports unavailable; verify finance schema"},503);}
}
