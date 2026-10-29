"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
type Student={
  id:string;student_no:string;full_name:string;class_grade:number;guardian_name:string;
  guardian_mobile:string;school_name:string|null;status:string;batch_name:string|null;
  offering_name:string|null;invoice_no:string|null;invoice_amount_paisa:number|null;
  invoice_paid_paisa:number|null;
};
const taka=(n:number)=>"৳"+(n/100).toFixed(2);
export function StudentsRegister(){
  const [items,setItems]=useState<Student[]>([]);
  const [query,setQuery]=useState(""),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const refresh=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const r=await fetch("/api/staff/students",{cache:"no-store",credentials:"same-origin"});
      const d=await r.json() as {items?:Student[];error?:string};
      if(!r.ok)throw new Error(d.error||"Unable to load student register");
      setItems(d.items||[]);
    }catch(e){setError(e instanceof Error?e.message:"Student data unavailable");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  const filtered=useMemo(()=>items.filter(s=>{
    const q=query.trim().toLowerCase();
    return !q||[s.student_no,s.full_name,s.guardian_name,s.guardian_mobile,s.batch_name||""]
      .some(x=>x.toLowerCase().includes(q));
  }),[items,query]);
  return <div className="space-y-6">
    <header className="border-b border-slate-200 pb-5">
      <p className="text-xs font-extrabold uppercase tracking-widest text-blue-700">Student records</p>
      <h1 className="mt-1 text-2xl font-extrabold text-slate-950">Student register</h1>
      <p className="mt-2 text-sm text-slate-600">Only completed, verified enrollments create student records. Interest registrations and accepted applications do not appear here.</p>
    </header>
    {error&&<p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <label className="w-full text-xs font-bold text-slate-600 sm:max-w-md">Search register
        <input className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          value={query} onChange={e=>setQuery(e.target.value)} placeholder="Student ID, name, guardian or batch"/>
      </label>
      <button type="button" onClick={()=>void refresh()} className="min-h-10 rounded-lg border border-slate-300 px-4 text-xs font-bold">Refresh</button>
    </div>
    <p className="text-xs text-slate-500">{filtered.length} of {items.length} loaded students</p>
    {loading?<p className="text-sm text-slate-500">Loading…</p>:filtered.length===0?<p className="rounded-xl bg-white p-6 text-sm">No matching students.</p>:
      <section className="grid gap-3 lg:grid-cols-2">
        {filtered.map(s=><article key={s.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="font-bold">{s.full_name}</h2>
              <p className="text-xs text-slate-500">{s.student_no} · Class {s.class_grade}</p></div>
            <span className="text-xs font-bold text-green-700">{s.status}</span>
          </div>
          <p className="mt-3 text-sm">{s.offering_name||"No offering"} · {s.batch_name||"No active batch"}</p>
          <p className="mt-2 text-xs text-slate-600">Guardian: {s.guardian_name} · {s.guardian_mobile}</p>
          {s.school_name&&<p className="mt-1 text-xs text-slate-500">School: {s.school_name}</p>}
          {s.invoice_no&&<p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-700">
            Initial invoice {s.invoice_no} · Outstanding {taka((s.invoice_amount_paisa||0)-(s.invoice_paid_paisa||0))}
          </p>}
        </article>)}
      </section>}
  </div>;
}
