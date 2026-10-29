"use client";
import {useCallback,useEffect,useState,type FormEvent} from "react";
import type {SubjectRow,OfferingSubjectRow} from "@/lib/erp-subjects";
type Group="GENERAL"|"SCIENCE"|"BUSINESS"|"HUMANITIES";
type LinkRow={offering_id:string;subject_id:string};
type Draft={code:string;name:string;classGrade:number;group:Group;reason:string};
const blank=():Draft=>({code:"",name:"",classGrade:10,group:"GENERAL",reason:""});
const field="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
export function SubjectsRegister(){
  const [rows,setRows]=useState<SubjectRow[]>([]);
  const [offerings,setOfferings]=useState<OfferingSubjectRow[]>([]);
  const [links,setLinks]=useState<LinkRow[]>([]);
  const [canEdit,setCanEdit]=useState(false);
  const [form,setForm]=useState(blank);
  const [nameEdits,setNameEdits]=useState<Record<string,string>>({});
  const [reasons,setReasons]=useState<Record<string,string>>({});
  const [selectedOffering,setSelectedOffering]=useState("");
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[message,setMessage]=useState("");
  const refresh=useCallback(async()=>{
    setLoading(true);
    try{
      const r=await fetch("/api/staff/subjects",{credentials:"same-origin",cache:"no-store"});
      const d=await r.json() as {items?:SubjectRow[];offerings?:OfferingSubjectRow[];
        links?:LinkRow[];canEdit?:boolean;error?:string};
      if(!r.ok)throw new Error(d.error||"Subjects unavailable");
      setRows(d.items||[]);setOfferings(d.offerings||[]);setLinks(d.links||[]);setCanEdit(Boolean(d.canEdit));
      setNameEdits(Object.fromEntries((d.items||[]).map(s=>[s.id,s.name])));
      setSelectedOffering(current=>current||(d.offerings?.[0]?.id||""));
      setReasons({});
    }catch(e){setMessage(e instanceof Error?e.message:"Cannot load subjects");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  async function create(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(busy)return;setBusy(true);setMessage("");
    try{
      const r=await fetch("/api/staff/subjects",{method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});
      const d=await r.json() as {error?:string};
      if(!r.ok)throw new Error(d.error||"Cannot create subject");
      setForm(blank());await refresh();setMessage("Subject added. Link it to an offering to display it on the public programme card.");
    }catch(e){setMessage(e instanceof Error?e.message:"Cannot create subject");}
    finally{setBusy(false);}
  }
  async function edit(row:SubjectRow,active:boolean){
    if(busy)return;setBusy(true);setMessage("");
    try{
      const r=await fetch("/api/staff/subjects/"+encodeURIComponent(row.id),{method:"PATCH",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({expectedVersion:row.version,name:nameEdits[row.id]||row.name,
          active,reason:reasons[row.id]||""})});
      const d=await r.json() as {error?:string};
      if(!r.ok)throw new Error(d.error||"Cannot update subject");
      await refresh();setMessage("Subject change saved and propagated to linked offerings.");
    }catch(e){setMessage(e instanceof Error?e.message:"Cannot update subject");}
    finally{setBusy(false);}
  }
  async function assign(subject:SubjectRow,action:"ADD"|"REMOVE"){
    const offering=offerings.find(o=>o.id===selectedOffering);
    if(!offering||busy)return;setBusy(true);setMessage("");
    try{
      const r=await fetch("/api/staff/subjects/assignment",{method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({subjectId:subject.id,offeringId:offering.id,
          expectedOfferingVersion:offering.version,action,reason:reasons[subject.id]||""})});
      const d=await r.json() as {error?:string};
      if(!r.ok)throw new Error(d.error||"Cannot update subject link");
      await refresh();setMessage("Programme subject list updated in D1; public cards read the new data.");
    }catch(e){setMessage(e instanceof Error?e.message:"Cannot update subject link");}
    finally{setBusy(false);}
  }
  return <div className="space-y-6">
    <header className="border-b border-slate-200 pb-5">
      <p className="text-xs font-extrabold uppercase tracking-widest text-blue-700">Academic configuration</p>
      <h1 className="mt-1 text-2xl font-extrabold">Subjects & programme assignment</h1>
      <p className="mt-2 text-sm text-slate-600">Subject definitions and their links to public programme offerings are stored in the same D1 database. Changes propagate to the public programme cards; no hardcoded duplicate catalogue is needed.</p>
    </header>
    {message&&<p role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{message}</p>}
    {canEdit&&<form onSubmit={create} className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-bold">Create subject</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-bold">Code<input className={field} required maxLength={16} value={form.code} onChange={e=>setForm(x=>({...x,code:e.target.value.toUpperCase()}))} placeholder="ENG"/></label>
        <label className="text-xs font-bold sm:col-span-2">Subject name<input className={field} required maxLength={120} value={form.name} onChange={e=>setForm(x=>({...x,name:e.target.value}))} placeholder="English"/></label>
        <label className="text-xs font-bold">Class<input className={field} type="number" min={4} max={12} value={form.classGrade} onChange={e=>setForm(x=>({...x,classGrade:Number(e.target.value)}))}/></label>
        <label className="text-xs font-bold">Group<select className={field} value={form.group} onChange={e=>setForm(x=>({...x,group:e.target.value as Group}))}>
          {(["GENERAL","SCIENCE","BUSINESS","HUMANITIES"] as Group[]).map(g=><option key={g} value={g}>{g}</option>)}
        </select></label>
        <label className="text-xs font-bold sm:col-span-2 lg:col-span-4">Creation reason<input className={field} required minLength={8} maxLength={500} value={form.reason} onChange={e=>setForm(x=>({...x,reason:e.target.value}))}/></label>
      </div>
      <button disabled={busy} className="mt-4 min-h-10 rounded-lg bg-blue-700 px-4 text-xs font-bold text-white disabled:opacity-50" type="submit">Add subject</button>
    </form>}
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-bold">Subject register</h2>
        <label className="text-xs font-bold">Manage programme links<select className={field} value={selectedOffering} onChange={e=>setSelectedOffering(e.target.value)}>
          {offerings.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
        </select></label>
      </div>
      {loading?<p className="text-sm text-slate-500">Loading…</p>:rows.length===0?<p className="rounded-xl bg-white p-5 text-sm">No subjects configured.</p>:
      <div className="grid gap-3 lg:grid-cols-2">{rows.map(s=>{
        const linked=links.some(l=>l.offering_id===selectedOffering&&l.subject_id===s.id);
        const canChange=(reasons[s.id]||"").trim().length>=8;
        return <article key={s.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap justify-between gap-3">
            <div><h3 className="font-bold">{s.name}</h3><p className="text-xs text-slate-500">{s.code} · Class {s.class_grade} · {s.group_name}</p></div>
            <span className="text-xs font-bold text-blue-700">{s.active?"Active":"Inactive"}{linked?" · Assigned":""}</span>
          </div>
          {canEdit&&<div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
            <label className="block text-xs font-bold">Name<input className={field} value={nameEdits[s.id]??s.name} onChange={e=>setNameEdits(x=>({...x,[s.id]:e.target.value}))}/></label>
            <label className="block text-xs font-bold">Change reason<input className={field} minLength={8} maxLength={500} value={reasons[s.id]||""} onChange={e=>setReasons(x=>({...x,[s.id]:e.target.value}))}/></label>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy||!canChange} onClick={()=>void edit(s,s.active===1)} className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-bold disabled:opacity-50">Save name</button>
              <button type="button" disabled={busy||!canChange} onClick={()=>void edit(s,s.active!==1)} className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-bold disabled:opacity-50">{s.active?"Deactivate":"Activate"}</button>
              <button type="button" disabled={busy||!canChange||(!linked&&s.active!==1)||!selectedOffering}
                onClick={()=>void assign(s,linked?"REMOVE":"ADD")}
                className="min-h-9 rounded-lg bg-blue-700 px-3 text-xs font-bold text-white disabled:opacity-50">{linked?"Remove from offering":"Assign to offering"}</button>
            </div>
          </div>}
        </article>;
      })}</div>}
    </section>
  </div>;
}
