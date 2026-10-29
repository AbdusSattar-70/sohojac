"use client";
import {useCallback,useEffect,useState,type FormEvent} from "react";
import type {SessionRow} from "@/lib/erp-routine";
type Batch={id:string;name:string};
type Draft={batchId:string;classOn:string;startsAt:string;endsAt:string;title:string;topic:string;reason:string};
const blank=():Draft=>({batchId:"",classOn:new Date().toISOString().slice(0,10),
  startsAt:"16:00",endsAt:"17:00",title:"",topic:"",reason:""});
const field="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
export function RoutineRegister(){
  const [items,setItems]=useState<SessionRow[]>([]);
  const [batches,setBatches]=useState<Batch[]>([]);
  const [canEdit,setCanEdit]=useState(false),[loading,setLoading]=useState(true);
  const [form,setForm]=useState(blank),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const [reasons,setReasons]=useState<Record<string,string>>({});
  const refresh=useCallback(async()=>{
    setLoading(true);
    try{
      const r=await fetch("/api/staff/routine",{credentials:"same-origin",cache:"no-store"});
      const d=await r.json() as {items?:SessionRow[];batches?:Batch[];canEdit?:boolean;error?:string};
      if(!r.ok)throw new Error(d.error||"Routine unavailable");
      setItems(d.items||[]);setBatches(d.batches||[]);setCanEdit(Boolean(d.canEdit));
    }catch(e){setMessage(e instanceof Error?e.message:"Routine unavailable");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  async function create(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(busy)return;setBusy(true);setMessage("");
    try{
      const r=await fetch("/api/staff/routine",{method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});
      const d=await r.json() as {error?:string};
      if(!r.ok)throw new Error(d.error||"Session not scheduled");
      setForm(blank());await refresh();setMessage("Class session scheduled and audited.");
    }catch(e){setMessage(e instanceof Error?e.message:"Cannot schedule class");}
    finally{setBusy(false);}
  }
  async function update(row:SessionRow,status:"HELD"|"CANCELLED"){
    if(busy)return;setBusy(true);setMessage("");
    try{
      const r=await fetch("/api/staff/routine/"+encodeURIComponent(row.id),{method:"PATCH",
        credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({nextStatus:status,expectedVersion:row.version,reason:reasons[row.id]||""})});
      const d=await r.json() as {error?:string};
      if(!r.ok)throw new Error(d.error||"Cannot update session");
      await refresh();setMessage("Session marked "+status+".");
    }catch(e){setMessage(e instanceof Error?e.message:"Could not change session");}
    finally{setBusy(false);}
  }
  return <div className="space-y-6">
    <header className="border-b border-slate-200 pb-5">
      <p className="text-xs font-extrabold uppercase tracking-widest text-blue-700">Academic operations</p>
      <h1 className="mt-1 text-2xl font-extrabold">Class routine</h1>
      <p className="mt-2 text-sm text-slate-600">Plan dated sessions for active batches, prevent overlapping times and record completed or cancelled classes. Individual teacher allocation is not enabled until assignment controls are complete.</p>
    </header>
    {message&&<p role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{message}</p>}
    {canEdit&&<form onSubmit={create} className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-bold">Schedule class session</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-bold sm:col-span-2">Batch<select className={field} required value={form.batchId} onChange={e=>setForm(x=>({...x,batchId:e.target.value}))}>
          <option value="">Select active batch</option>{batches.map(b=><option value={b.id} key={b.id}>{b.name}</option>)}
        </select></label>
        <label className="text-xs font-bold">Date<input className={field} required type="date" value={form.classOn} onChange={e=>setForm(x=>({...x,classOn:e.target.value}))}/></label>
        <label className="text-xs font-bold">Starts at<input className={field} required type="time" value={form.startsAt} onChange={e=>setForm(x=>({...x,startsAt:e.target.value}))}/></label>
        <label className="text-xs font-bold">Ends at<input className={field} required type="time" value={form.endsAt} onChange={e=>setForm(x=>({...x,endsAt:e.target.value}))}/></label>
        <label className="text-xs font-bold sm:col-span-2">Lesson title<input className={field} required maxLength={160} value={form.title} onChange={e=>setForm(x=>({...x,title:e.target.value}))}/></label>
        <label className="text-xs font-bold sm:col-span-2 lg:col-span-4">Lesson topic (optional)<input className={field} maxLength={500} value={form.topic} onChange={e=>setForm(x=>({...x,topic:e.target.value}))}/></label>
        <label className="text-xs font-bold sm:col-span-2 lg:col-span-4">Reason for scheduling<input className={field} minLength={8} maxLength={500} required value={form.reason} onChange={e=>setForm(x=>({...x,reason:e.target.value}))}/></label>
      </div>
      <button type="submit" disabled={busy} className="mt-4 min-h-10 rounded-lg bg-blue-700 px-4 text-xs font-bold text-white disabled:opacity-50">Save scheduled class</button>
    </form>}
    <section className="space-y-3">
      <h2 className="font-bold">Dated class sessions</h2>
      {loading?<p className="text-sm text-slate-500">Loading…</p>:items.length===0?<p className="rounded-xl bg-white p-5 text-sm">No scheduled sessions.</p>:
        items.map(row=><article className="rounded-xl border border-slate-200 bg-white p-4" key={row.id}>
          <div className="flex flex-wrap justify-between gap-3">
            <div><h3 className="font-bold">{row.title}</h3>
              <p className="text-xs text-slate-600">{row.batch_name} · {row.class_on} · {row.starts_at}–{row.ends_at}</p>
              {row.topic&&<p className="mt-2 text-sm text-slate-700">{row.topic}</p>}
            </div><span className="text-xs font-extrabold text-blue-800">{row.status}</span>
          </div>
          {canEdit&&row.status==="SCHEDULED"&&<div className="mt-3 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
            <label className="min-w-[200px] flex-1 text-xs font-bold">Reason for change<input className={field} value={reasons[row.id]||""} minLength={8} maxLength={500} onChange={e=>setReasons(x=>({...x,[row.id]:e.target.value}))}/></label>
            <button type="button" onClick={()=>void update(row,"HELD")} disabled={busy||(reasons[row.id]||"").trim().length<8} className="min-h-10 rounded-lg bg-blue-700 px-4 text-xs font-bold text-white disabled:opacity-50">Mark held</button>
            <button type="button" onClick={()=>void update(row,"CANCELLED")} disabled={busy||(reasons[row.id]||"").trim().length<8} className="min-h-10 rounded-lg border border-red-300 px-4 text-xs font-bold text-red-700 disabled:opacity-50">Cancel</button>
          </div>}
        </article>)}
    </section>
  </div>;
}
