"use client";
import {useCallback,useEffect,useState} from "react";
type Report={
  month:string;billedPaisa:number;collectedPaisa:number;operatingExpensePaisa:number;
  cashMovementPaisa:number;outstandingPaisa:number;activeStudents:number;activeBatches:number;
  newEnrollments:number;ledgerDebitsPaisa:number;ledgerCreditsPaisa:number;
  ledgerBalanced:boolean;attendance:Array<{state:string;total:number}>;
};
const taka=(v:number)=>(v<0?"−":"")+"৳"+(Math.abs(v)/100).toLocaleString("en-BD",{minimumFractionDigits:2,maximumFractionDigits:2});
function Metric({title,value,detail}:{
  title:string;value:string|number;detail:string;
}){
  return <div className="rounded-xl border border-slate-200 bg-white p-5">
    <p className="text-xs font-bold text-slate-500">{title}</p>
    <p className="mt-2 text-2xl font-extrabold">{value}</p>
    <p className="mt-2 text-xs text-slate-500">{detail}</p>
  </div>;
}
export function ManagementReport(){
  const [month,setMonth]=useState(()=>new Date().toISOString().slice(0,7));
  const [report,setReport]=useState<Report|null>(null);
  const [loading,setLoading]=useState(true),[error,setError]=useState("");
  const refresh=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const r=await fetch("/api/staff/reports?month="+encodeURIComponent(month),{
        credentials:"same-origin",cache:"no-store",
      });
      const data=await r.json() as Report&{error?:string};
      if(!r.ok)throw new Error(data.error||"Report unavailable");
      setReport(data);
    }catch(e){setReport(null);setError(e instanceof Error?e.message:"Report unavailable");}
    finally{setLoading(false);}
  },[month]);
  useEffect(()=>{void refresh();},[refresh]);
  return <div className="space-y-6">
    <header className="border-b border-slate-200 pb-5">
      <p className="text-xs font-extrabold uppercase tracking-widest text-blue-700">Management reporting</p>
      <h1 className="mt-1 text-2xl font-extrabold text-slate-950">Finance & enrollment overview</h1>
      <p className="mt-2 text-sm text-slate-600">Cash collections and operating outflows are shown separately from billed charges. This report is not a profit and loss statement or a revenue-recognition report.</p>
    </header>
    <div className="flex flex-wrap items-end gap-4">
      <label className="text-xs font-bold">Report month
        <input type="month" value={month} onChange={e=>setMonth(e.target.value)}
          className="mt-1 block min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"/>
      </label>
      <button type="button" onClick={()=>void refresh()} disabled={loading}
        className="min-h-10 rounded-lg border border-slate-300 px-4 text-xs font-bold disabled:opacity-50">Refresh</button>
    </div>
    {error&&<p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {loading?<p className="text-sm text-slate-500">Loading report…</p>:report&&<>
      <section className="space-y-3">
        <h2 className="font-bold">Finance — {report.month}</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Metric title="Invoices issued" value={taka(report.billedPaisa)} detail="Billed this month; not necessarily collected"/>
          <Metric title="Payments collected" value={taka(report.collectedPaisa)} detail="Cash, bank and mobile money received"/>
          <Metric title="Operating expenses paid" value={taka(report.operatingExpensePaisa)} detail="Recorded operating outflows"/>
          <Metric title="Net recorded cash movement" value={taka(report.cashMovementPaisa)} detail="Collections minus these expenses; not accounting profit"/>
          <Metric title="Outstanding tuition" value={taka(report.outstandingPaisa)} detail="Unpaid student invoices across all months"/>
          <Metric title="Ledger status" value={report.ledgerBalanced?"Balanced":"Out of balance"}
            detail={taka(report.ledgerDebitsPaisa)+" debits / "+taka(report.ledgerCreditsPaisa)+" credits"}/>
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="font-bold">Enrollment & classroom activity</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Metric title="Active students" value={report.activeStudents} detail="Current academy-wide count"/>
          <Metric title="Active batches" value={report.activeBatches} detail="Current academy-wide count"/>
          <Metric title="New enrollments" value={report.newEnrollments} detail="Students enrolled in selected month"/>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-bold">Attendance records by status</h3>
          {report.attendance.length===0?<p className="mt-2 text-sm text-slate-500">No attendance recorded in this month.</p>:
          <div className="mt-3 grid gap-3 sm:grid-cols-4">{report.attendance.map(t=><div key={t.state}>
            <p className="text-xs text-slate-500">{t.state}</p><p className="mt-1 text-xl font-extrabold">{t.total}</p>
          </div>)}</div>}
        </div>
      </section>
      <p className="text-xs leading-5 text-slate-600">This operational dashboard excludes unposted commitments, payroll liabilities, depreciation, refunds and revenue accruals until those modules are implemented. It must not be used as a statutory financial statement.</p>
    </>}
  </div>;
}
