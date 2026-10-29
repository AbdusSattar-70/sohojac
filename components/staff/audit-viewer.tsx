"use client";
import {useCallback,useEffect,useState} from "react";
type Entry={id:string;entity_type:string;entity_id:string;action:string;
  actor_name:string|null;reason:string;occurred_at:string};
type Type={entity_type:string;total:number};
const field="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
export function AuditViewer(){
  const [items,setItems]=useState<Entry[]>([]);
  const [types,setTypes]=useState<Type[]>([]);
  const [page,setPage]=useState(1),[type,setType]=useState("ALL");
  const [hasMore,setHasMore]=useState(false),[loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const refresh=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const q=new URLSearchParams({page:String(page),type});
      const r=await fetch("/api/staff/audit?"+q.toString(),{cache:"no-store",credentials:"same-origin"});
      const data=await r.json() as {items?:Entry[];types?:Type[];hasMore?:boolean;error?:string};
      if(!r.ok)throw new Error(data.error||"Audit records unavailable");
      setItems(data.items||[]);setTypes(data.types||[]);setHasMore(Boolean(data.hasMore));
    }catch(e){setError(e instanceof Error?e.message:"Could not load history");}
    finally{setLoading(false);}
  },[page,type]);
  useEffect(()=>{void refresh();},[refresh]);
  return <div className="space-y-6">
    <header className="border-b border-slate-200 pb-5">
      <p className="text-xs font-extrabold uppercase tracking-widest text-blue-700">Governance</p>
      <h1 className="mt-1 text-2xl font-extrabold">Audit history</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">Review operational changes and the stated reason. Only owners and administrators can access this view. Stored before/after payloads are intentionally not exposed.</p>
    </header>
    {error&&<p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    <div className="flex flex-wrap items-end justify-between gap-3">
      <label className="text-xs font-bold">Record category<select className={field} value={type} onChange={e=>{setType(e.target.value);setPage(1);}}>
        <option value="ALL">All changes</option>{types.map(t=><option key={t.entity_type} value={t.entity_type}>{t.entity_type.replaceAll("_"," ")} ({t.total})</option>)}
      </select></label>
      <button onClick={()=>void refresh()} className="min-h-10 rounded-lg border border-slate-300 px-4 text-xs font-bold">Refresh</button>
    </div>
    <section aria-label="Audit events" className="space-y-2">
      {loading?<p className="text-sm text-slate-500">Loading…</p>:items.length===0?<p className="rounded-xl bg-white p-5 text-sm">No matching changes.</p>:items.map(event=><article key={event.id} className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-sm font-bold">{event.action.replaceAll("_"," ")} · {event.entity_type.replaceAll("_"," ")}</h2>
            <p className="mt-1 text-xs text-slate-600">By {event.actor_name||"Former staff member"} · {new Date(event.occurred_at).toLocaleString("en-BD",{timeZone:"Asia/Dhaka"})}</p>
            <p className="mt-2 text-sm text-slate-900">{event.reason||"No reason recorded"}</p></div>
          <span className="text-[10px] text-slate-400">Record {event.entity_id.slice(0,16)}</span>
        </div>
      </article>)}
    </section>
    <nav aria-label="Audit pagination" className="flex items-center justify-between gap-4">
      <button type="button" disabled={page===1||loading} onClick={()=>setPage(v=>Math.max(1,v-1))} className="min-h-10 rounded-lg border border-slate-300 px-4 text-xs font-bold disabled:opacity-50">Previous</button>
      <p className="text-xs font-bold">Page {page}</p>
      <button type="button" disabled={!hasMore||loading} onClick={()=>setPage(v=>v+1)} className="min-h-10 rounded-lg border border-slate-300 px-4 text-xs font-bold disabled:opacity-50">Next</button>
    </nav>
  </div>;
}
