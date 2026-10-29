"use client";
import {useCallback,useEffect,useState} from "react";
import type {AttendanceRow} from "@/lib/erp-attendance";
type Batch={id:string;name:string;status:string};
type State="PRESENT"|"ABSENT"|"LATE"|"EXCUSED";
const statuses:State[]=["PRESENT","ABSENT","LATE","EXCUSED"];
const field="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-blue-700";
export function AttendanceRegister(){
  const [batches,setBatches]=useState<Batch[]>([]);
  const [batchId,setBatchId]=useState("");
  const [date,setDate]=useState(()=>new Date().toISOString().slice(0,10));
  const [items,setItems]=useState<AttendanceRow[]>([]);
  const [drafts,setDrafts]=useState<Record<string,State>>({});
  const [reasons,setReasons]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState<string|null>(null);
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(false);
  const refresh=useCallback(async()=>{
    setLoading(true);
    try{
      const query=new URLSearchParams({batchId,date});
      const r=await fetch("/api/staff/attendance?"+query.toString(),{credentials:"same-origin",cache:"no-store"});
      const data=await r.json() as {batches?:Batch[];items?:AttendanceRow[];error?:string};
      if(!r.ok)throw new Error(data.error||"Attendance unavailable");
      setBatches(data.batches||[]);setItems(data.items||[]);
      setDrafts(Object.fromEntries((data.items||[]).map(x=>[x.enrollment_id,x.state||"PRESENT"])));
      setReasons({});
    }catch(e){setMessage(e instanceof Error?e.message:"Attendance unavailable");}
    finally{setLoading(false);}
  },[batchId,date]);
  useEffect(()=>{void refresh();},[refresh]);
  async function save(row:AttendanceRow){
    if(busy)return;setBusy(row.enrollment_id);setMessage("");
    try{
      const res=await fetch("/api/staff/attendance",{
        method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({enrollmentId:row.enrollment_id,classOn:date,
          state:drafts[row.enrollment_id]||"PRESENT",expectedVersion:row.version||0,
          reason:reasons[row.enrollment_id]||""}),
      });
      const data=await res.json() as {error?:string};
      if(!res.ok)throw new Error(data.error||"Cannot record attendance");
      await refresh();setMessage("Attendance saved with a traceable audit event.");
    }catch(e){setMessage(e instanceof Error?e.message:"Could not save attendance");}
    finally{setBusy(null);}
  }
  return <div className="space-y-6">
    <header className="border-b border-slate-200 pb-5">
      <p className="text-xs font-extrabold uppercase tracking-widest text-blue-700">Academic operations</p>
      <h1 className="mt-1 text-2xl font-extrabold">Daily attendance</h1>
      <p className="mt-2 text-sm text-slate-600">Record attendance for actively enrolled students in an active batch. Every correction requires a reason and is version-controlled. Teacher access will be enabled only after assigned-class permissions are ready.</p>
    </header>
    {message&&<p role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{message}</p>}
    <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
      <label className="text-xs font-bold">Active batch<select className={field} value={batchId} onChange={e=>setBatchId(e.target.value)}>
        <option value="">Select batch</option>{batches.map(b=><option value={b.id} key={b.id}>{b.name}</option>)}
      </select></label>
      <label className="text-xs font-bold">Class date<input className={field} type="date" value={date} max={new Date().toISOString().slice(0,10)} onChange={e=>setDate(e.target.value)}/></label>
    </div>
    <section className="space-y-3">
      <h2 className="font-bold">Student attendance register</h2>
      {loading?<p className="text-sm text-slate-500">Loading…</p>:!batchId?<p className="rounded-xl bg-white p-5 text-sm">Choose an active batch to start.</p>:items.length===0?<p className="rounded-xl bg-white p-5 text-sm">No active enrollments in this batch.</p>:items.map(row=><article className="rounded-xl border border-slate-200 bg-white p-4" key={row.enrollment_id}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><p className="font-bold">{row.student_name}</p><p className="text-xs text-slate-500">{row.student_no}</p></div>
          <span className="text-xs font-bold text-blue-700">{row.state||"Not recorded"}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
          <label className="text-xs font-bold">Attendance<select className={field} value={drafts[row.enrollment_id]||"PRESENT"} onChange={e=>setDrafts(x=>({...x,[row.enrollment_id]:e.target.value as State}))}>
            {statuses.map(s=><option key={s} value={s}>{s}</option>)}
          </select></label>
          <label className="text-xs font-bold">Reason for entry or correction<input className={field} value={reasons[row.enrollment_id]||""} minLength={8} maxLength={500} placeholder="Verified from classroom roll" onChange={e=>setReasons(x=>({...x,[row.enrollment_id]:e.target.value}))}/></label>
          <button className="min-h-10 rounded-lg bg-blue-700 px-4 text-xs font-bold text-white disabled:opacity-50" type="button" disabled={!!busy||(reasons[row.enrollment_id]||"").trim().length<8} onClick={()=>void save(row)}>{busy===row.enrollment_id?"Saving…":"Save"}</button>
        </div>
      </article>)}
    </section>
  </div>;
}
