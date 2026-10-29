"use client";

import {useCallback,useEffect,useState,type FormEvent} from "react";

type Status="DRAFT"|"ACTIVE"|"CLOSED";
type Year={id:string;code:string;title:string;starts_on:string|null;ends_on:string|null;status:Status;version:number};
type Draft={title:string;startsOn:string;endsOn:string;nextStatus:Status;reason:string};
const input="mt-1.5 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-700";
const draftFrom=(y:Year):Draft=>({
  title:y.title,startsOn:y.starts_on||"",endsOn:y.ends_on||"",
  nextStatus:y.status,reason:"",
});
export function AcademicYearsRegister(){
  const [items,setItems]=useState<Year[]>([]);
  const [canEdit,setCanEdit]=useState(false);
  const [drafts,setDrafts]=useState<Record<string,Draft>>({});
  const [newCode,setNewCode]=useState("");
  const [newTitle,setNewTitle]=useState("");
  const [newStart,setNewStart]=useState("");
  const [newEnd,setNewEnd]=useState("");
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState("");
  const refresh=useCallback(async()=>{
    setLoading(true);
    try{
      const response=await fetch("/api/staff/academic-years",{cache:"no-store",credentials:"same-origin"});
      if(!response.ok)throw new Error("Could not load academic years");
      const data=await response.json() as {items:Year[];canEdit:boolean};
      setItems(data.items);setCanEdit(data.canEdit);
      setDrafts(Object.fromEntries(data.items.map(row=>[row.id,draftFrom(row)])));
    }catch{setMessage("Academic year records are unavailable.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);

  async function create(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy)return;setBusy(true);setMessage("");
    try{
      const response=await fetch("/api/staff/academic-years",{
        method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({code:newCode,title:newTitle,startsOn:newStart,endsOn:newEnd}),
      });
      const data=await response.json() as {error?:string};
      if(!response.ok)throw new Error(data.error||"Cannot create academic year");
      setNewCode("");setNewTitle("");setNewStart("");setNewEnd("");
      await refresh();setMessage("Academic year created in draft status.");
    }catch(error){setMessage(error instanceof Error?error.message:"Could not create year");}
    finally{setBusy(false);}
  }

  async function update(row:Year){
    const draft=drafts[row.id]||draftFrom(row);
    setBusy(true);setMessage("");
    try{
      const response=await fetch("/api/staff/academic-years/"+encodeURIComponent(row.id),{
        method:"PATCH",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({...draft,expectedVersion:row.version}),
      });
      const data=await response.json() as {error?:string};
      if(!response.ok)throw new Error(data.error||"Could not save year");
      await refresh();setMessage("Academic year saved with a traceable audit event.");
    }catch(error){setMessage(error instanceof Error?error.message:"Could not save year");}
    finally{setBusy(false);}
  }

  const patch=(id:string,change:Partial<Draft>)=>setDrafts(prev=>({
    ...prev,[id]:{...prev[id],...change},
  }));
  return <div className="space-y-6">
    <header className="border-b border-slate-200 pb-5">
      <p className="text-xs font-extrabold uppercase tracking-widest text-blue-700">Academic settings</p>
      <h1 className="mt-1 text-2xl font-extrabold text-slate-950">Academic years</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
        Create years in draft, then activate each year independently.
        Multiple academic years can remain active together. Closing an active year is irreversible.
      </p>
    </header>
    {message&&<p role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{message}</p>}
    {canEdit&&<form onSubmit={create} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-slate-900">New academic year</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <label className="text-xs font-bold text-slate-600">Year code
          <input value={newCode} onChange={e=>setNewCode(e.target.value.toUpperCase())}
            placeholder="2027" minLength={2} maxLength={24} required className={input}/>
        </label>
        <label className="text-xs font-bold text-slate-600 sm:col-span-3">Year title
          <input value={newTitle} onChange={e=>setNewTitle(e.target.value)}
            placeholder="Academic Year 2027" minLength={3} maxLength={100} required className={input}/>
        </label>
        <label className="text-xs font-bold text-slate-600">Start date (optional)
          <input type="date" value={newStart} onChange={e=>setNewStart(e.target.value)} className={input}/>
        </label>
        <label className="text-xs font-bold text-slate-600">End date (optional)
          <input type="date" value={newEnd} onChange={e=>setNewEnd(e.target.value)} className={input}/>
        </label>
      </div>
      <button disabled={busy} type="submit" className="mt-4 min-h-10 rounded-lg bg-blue-700 px-4 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">
        {busy?"Saving…":"Create draft year"}
      </button>
    </form>}
    <section aria-label="Academic year register" className="space-y-4">
      <h2 className="text-base font-bold text-slate-900">Year register</h2>
      {loading?<p className="p-4 text-sm text-slate-500">Loading academic years…</p>:
        items.length===0?<p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">No academic years configured yet.</p>:
        items.map(row=>{
          const draft=drafts[row.id]||draftFrom(row);
          return <section key={row.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="font-bold text-slate-950">{row.title}</p>
                <p className="mt-1 text-xs text-slate-500">Code: {row.code} · Version {row.version}</p></div>
              <span className={"rounded-full px-3 py-1 text-xs font-bold "+
                (row.status==="ACTIVE"?"bg-green-100 text-green-800":
                  row.status==="DRAFT"?"bg-amber-100 text-amber-800":"bg-slate-100 text-slate-700")}>
                {row.status}
              </span>
            </div>
            {canEdit&&row.status!=="CLOSED"&&<div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-4">
              <label className="text-xs font-bold text-slate-600 sm:col-span-4">Title
                <input value={draft.title} maxLength={100} onChange={e=>patch(row.id,{title:e.target.value})} className={input}/>
              </label>
              <label className="text-xs font-bold text-slate-600">Start date
                <input type="date" value={draft.startsOn} onChange={e=>patch(row.id,{startsOn:e.target.value})} className={input}/>
              </label>
              <label className="text-xs font-bold text-slate-600">End date
                <input type="date" value={draft.endsOn} onChange={e=>patch(row.id,{endsOn:e.target.value})} className={input}/>
              </label>
              <label className="text-xs font-bold text-slate-600">Next status
                <select value={draft.nextStatus} onChange={e=>patch(row.id,{nextStatus:e.target.value as Status})} className={input}>
                  <option value={row.status}>{row.status}</option>
                  {row.status==="DRAFT"&&<option value="ACTIVE">ACTIVE</option>}
                  {row.status==="ACTIVE"&&<option value="CLOSED">CLOSED</option>}
                </select>
              </label>
              <label className="text-xs font-bold text-slate-600 sm:col-span-4">Reason for update (required)
                <input value={draft.reason} minLength={8} maxLength={500}
                  onChange={e=>patch(row.id,{reason:e.target.value})}
                  placeholder="What changed, why, and who authorized it" className={input}/>
              </label>
              <button type="button" disabled={busy||draft.reason.trim().length<8}
                onClick={()=>void update(row)}
                className="min-h-10 rounded-lg bg-blue-700 px-4 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">
                Save changes
              </button>
            </div>}
            {!canEdit&&<p className="mt-3 text-xs text-slate-500">Read-only academic view.</p>}
          </section>;
        })}
    </section>
  </div>;
}
