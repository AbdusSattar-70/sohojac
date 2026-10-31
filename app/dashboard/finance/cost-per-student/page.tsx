import Link from "next/link";
import {requirePermission} from "@/modules/platform/auth/erp-context";
import {getCurrentOperatingCostPerStudent} from "@/modules/finance/analytics/cost-per-student";

export const dynamic="force-dynamic";
export const metadata={title:"Operating cost per student · Sohoj Academy ERP",
 robots:{index:false,follow:false}};
const money=(paisa:number)=>"৳"+(paisa/100).toLocaleString("en-BD",{minimumFractionDigits:2,maximumFractionDigits:2});
export default async function CostPerStudentPage(){
 const context=await requirePermission("accounting.view");
 if(!context.roles.some(role=>role==="OWNER"||role==="ADMIN"))
  return <p className="p-6 text-sm" role="alert">Only academy management can access this report.</p>;
 const result=await getCurrentOperatingCostPerStudent();
 return <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
  <header className="space-y-2">
   <Link href="/dashboard/finance/reports" className="text-sm text-muted-foreground underline">← Management reports</Link>
   <p className="text-xs font-semibold uppercase tracking-wider text-primary">Finance / operating analytics</p>
   <h1 className="text-2xl font-bold">Recorded operating cost per active student</h1>
   <p className="text-sm text-muted-foreground">
    From {result.start} through {result.today} (Bangladesh time). This is a month-to-date
    snapshot using today's active enrollment. It is not a full monthly cost, budget, or profit figure.
   </p>
  </header>
  <section className="grid gap-3 sm:grid-cols-3">
   <div className="rounded-xl border border-border bg-card p-5">
    <p className="text-sm text-muted-foreground">Operating expenses recorded this month</p>
    <p className="mt-2 text-2xl font-bold">{money(result.recordedOperatingPaisa)}</p>
    <p className="mt-2 text-xs text-muted-foreground">{result.entries} recorded expense entries</p>
   </div>
   <div className="rounded-xl border border-border bg-card p-5">
    <p className="text-sm text-muted-foreground">Distinct active enrolled students now</p>
    <p className="mt-2 text-2xl font-bold">{result.activeStudents}</p>
    <p className="mt-2 text-xs text-muted-foreground">One student counted once across active batches</p>
   </div>
   <div className="rounded-xl border border-border bg-card p-5">
    <p className="text-sm text-muted-foreground">Recorded operating expense per student (MTD)</p>
    <p className="mt-2 text-2xl font-bold">
     {result.perStudentPaisa===null?"Not available":money(result.perStudentPaisa)}
    </p>
    <p className="mt-2 text-xs text-muted-foreground">
     {result.perStudentPaisa===null?"No active enrolled students; a per-student figure cannot be calculated":
       "Recorded operating expenses divided by current distinct active students"}
    </p>
   </div>
  </section>
  <section className="rounded-xl border border-border bg-card p-5">
   <h2 className="font-semibold">Recorded operating expenses by category</h2>
   {result.categories.length? <div className="mt-4 overflow-x-auto">
    <table className="w-full text-left text-sm"><thead><tr className="border-b">
     <th scope="col" className="p-3">Category</th>
     <th scope="col" className="p-3 text-right">Entries</th>
     <th scope="col" className="p-3 text-right">Amount</th>
    </tr></thead><tbody>{result.categories.map(x=><tr key={x.category} className="border-b last:border-0">
     <td className="p-3">{x.category.replaceAll("_"," ")}</td>
     <td className="p-3 text-right">{x.entries}</td>
     <td className="p-3 text-right">{money(x.paisa)}</td>
    </tr>)}</tbody></table>
   </div>:<p className="mt-3 text-sm text-muted-foreground">No operating expenses recorded this month.</p>}
  </section>
  <section className="rounded-xl border border-border p-5 text-sm">
   <h2 className="font-semibold">Important accounting limits</h2>
   <p className="mt-2 text-muted-foreground">
    These figures only include entries posted in Operating Expenses (rent, utilities, materials,
    marketing and similar categories). They exclude payroll, teaching compensation,
    referral commissions, capital investment, unpaid liabilities, tax, depreciation and other
    costs outside this register. The denominator is today's active students, not a historic
    month-end roster or student-weighted attendance. Do not interpret this as total academy cost,
    pricing break-even, or per-student profitability.
   </p>
  </section>
 </main>;
}
