"use client";

import {useCallback,useEffect,useState,type FormEvent} from "react";
import Link from "next/link";
import type {StaffOffering} from "@/lib/erp-offerings";

type State="OPEN"|"UPCOMING"|"CLOSED";
type Draft={
  name:string;className:string;academicYearName:string;branchName:string;
  groupName:string;showcaseTitle:string;showcaseTitleBn:string;
  showcaseDescription:string;showcaseDescriptionBn:string;
  publicSchedule:string;publicScheduleBn:string;
  showOnWebsite:boolean;isActive:boolean;applicationState:State;
  sortOrder:number;reason:string;
};
const makeDraft=(row:StaffOffering):Draft=>({
  name:row.name,className:row.class_name,academicYearName:row.academic_year_name,
  branchName:row.branch_name,groupName:row.group_name||"",
  showcaseTitle:row.showcase_title||"",showcaseTitleBn:row.showcase_title_bn||"",
  showcaseDescription:row.showcase_description||"",
  showcaseDescriptionBn:row.showcase_description_bn||"",
  publicSchedule:row.public_schedule||"",publicScheduleBn:row.public_schedule_bn||"",
  showOnWebsite:row.show_on_website===1,isActive:row.is_active===1,
  applicationState:row.application_state,sortOrder:row.showcase_sort_order,reason:"",
});
const field="mt-1.5 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-700";

export function OfferingsRegister() {
  const [items,setItems]=useState<StaffOffering[]>([]);
  const [canEdit,setCanEdit]=useState(false);
  const [drafts,setDrafts]=useState<Record<string,Draft>>({});
  const [expanded,setExpanded]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [created,setCreated]=useState({code:"",name:"",className:"",academicYearName:"",branchName:"Sohoj Academy",groupName:"",reason:""});

  const refresh=useCallback(async()=>{
    setLoading(true);
    try{
      const response=await fetch("/api/staff/offerings",{cache:"no-store",credentials:"same-origin"});
      if(!response.ok)throw new Error("Programme catalogue unavailable");
      const data=await response.json() as {items:StaffOffering[];canEdit:boolean};
      setItems(data.items);setCanEdit(data.canEdit);
      setDrafts(Object.fromEntries(data.items.map(row=>[row.id,makeDraft(row)])));
    }catch{setMessage("Could not load programme offerings.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  const patch=(id:string,part:Partial<Draft>)=>
    setDrafts(prev=>({...prev,[id]:{...prev[id],...part}}));

  async function create(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy)return;setBusy(true);setMessage("");
    try{
      const result=await fetch("/api/staff/offerings",{
        method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json"},body:JSON.stringify(created),
      });
      const data=await result.json() as {error?:string};
      if(!result.ok)throw new Error(data.error||"Could not create offering");
      setCreated({code:"",name:"",className:"",academicYearName:"",branchName:"Sohoj Academy",groupName:"",reason:""});
      await refresh();setMessage("Created as inactive, unpublished and closed. Review before enabling applications.");
    }catch(error){setMessage(error instanceof Error?error.message:"Could not create offering");}
    finally{setBusy(false);}
  }

  async function save(row:StaffOffering){
    if(busy)return;setBusy(true);setMessage("");
    const draft=drafts[row.id]||makeDraft(row);
    try{
      const response=await fetch("/api/staff/offerings/"+encodeURIComponent(row.id),{
        method:"PATCH",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({...draft,expectedVersion:row.version}),
      });
      const data=await response.json() as {error?:string};
      if(!response.ok)throw new Error(data.error||"Could not save offering");
      await refresh();
      setMessage("Programme saved. The published website will use the updated D1 values.");
    }catch(error){setMessage(error instanceof Error?error.message:"Could not save programme");}
    finally{setBusy(false);}
  }

  return <div className="space-y-6">
    <header className="border-b border-slate-200 pb-5">
      <p className="text-xs font-extrabold uppercase tracking-widest text-blue-700">Academic Setup</p>
      <h1 className="mt-1 text-2xl font-extrabold text-slate-950">Programme offerings</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
        This register controls what appears on the public site and whether an application may be submitted.
        Public interest registrations do not guarantee admission, billing or a seat.
      </p>
    </header>
    {message&&<p role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{message}</p>}
    {canEdit&&<form onSubmit={create} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-slate-900">Create unpublished offering</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {([
          ["code","Unique code","SSC2027"],["name","Programme name","SSC A+ Preparation"],
          ["className","Class and group","Class 10 · Science"],
          ["academicYearName","Academic year","2027"],["branchName","Branch","Sohoj Academy"],
          ["groupName","Group (optional)","Science"],
        ] as const).map(([key,label,placeholder])=><label key={key} className="text-xs font-bold text-slate-600">
          {label}<input className={field} required={key!=="groupName"} maxLength={key==="code"?40:160}
            placeholder={placeholder} value={created[key]}
            onChange={e=>setCreated(prev=>({...prev,[key]:e.target.value}))}/>
        </label>)}
        <label className="text-xs font-bold text-slate-600 md:col-span-3">Reason for creating (required)
          <input className={field} required minLength={8} maxLength={500} value={created.reason}
            onChange={e=>setCreated(prev=>({...prev,reason:e.target.value}))}
            placeholder="Why this programme offering is needed"/>
        </label>
      </div>
      <button type="submit" disabled={busy} className="mt-4 min-h-10 rounded-lg bg-blue-700 px-4 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">
        {busy?"Creating…":"Create draft offering"}
      </button>
    </form>}
    <section aria-label="Programme offering register" className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-base font-bold text-slate-900">Offering register</h2>
        <button type="button" onClick={()=>void refresh()} disabled={busy||loading}
          className="text-xs font-bold text-blue-700 hover:underline disabled:opacity-50">Refresh</button>
      </div>
      {loading?<p className="p-5 text-sm text-slate-500">Loading programmes…</p>:items.length===0?
        <p className="rounded-xl border border-slate-200 bg-white p-7 text-sm text-slate-600">No programme offerings recorded.</p>:
        items.map(row=>{
          const draft=drafts[row.id]||makeDraft(row);
          const isOpen=expanded===row.id;
          return <div key={row.id} className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div><p className="text-sm font-bold text-slate-900">{row.name}</p>
                <p className="mt-1 text-xs text-slate-500">{row.code} · {row.class_name} · {row.academic_year_name}</p>
                <p className="mt-1 text-xs text-slate-500">Version {row.version} · {row.is_active?"Active":"Inactive"} · {row.show_on_website?"Published":"Unpublished"}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={"rounded-full px-2.5 py-1 text-xs font-bold "+
                  (row.application_state==="OPEN"?"bg-green-100 text-green-800":
                   row.application_state==="UPCOMING"?"bg-amber-100 text-amber-800":"bg-slate-100 text-slate-700")}>
                  {row.application_state}
                </span>
                {canEdit&&<button type="button" onClick={()=>setExpanded(isOpen?null:row.id)}
                  aria-expanded={isOpen}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50">
                  {isOpen?"Close edit":"Edit controls"}
                </button>}
              </div>
            </div>
            {isOpen&&canEdit&&<div className="space-y-5 border-t border-slate-200 bg-slate-50/50 p-5">
              <div className="grid gap-3 md:grid-cols-3">
                {([
                  ["name","Programme name"],["className","Class / eligibility"],
                  ["academicYearName","Academic year"],["branchName","Branch"],
                  ["groupName","Group"],
                ] as const).map(([key,label])=><label key={key} className="text-xs font-bold text-slate-600">
                  {label}<input className={field} value={draft[key]} maxLength={160}
                    onChange={e=>patch(row.id,{[key]:e.target.value})}/>
                </label>)}
              </div>
              <h3 className="text-sm font-bold text-slate-900">Public catalogue copy</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {([
                  ["showcaseTitle","Public title (English)"],["showcaseTitleBn","Public title (Bengali)"],
                  ["showcaseDescription","Description (English)"],["showcaseDescriptionBn","Description (Bengali)"],
                  ["publicSchedule","Schedule (English)"],["publicScheduleBn","Schedule (Bengali)"],
                ] as const).map(([key,label])=><label key={key} className="text-xs font-bold text-slate-600">
                  {label}<textarea rows={key.includes("Description")?3:2} className={field+" resize-y"} value={draft[key]}
                    maxLength={key.includes("Description")?400:300}
                    onChange={e=>patch(row.id,{[key]:e.target.value})}/>
                </label>)}
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <input type="checkbox" checked={draft.isActive}
                    onChange={e=>patch(row.id,{isActive:e.target.checked})}/>
                  Active programme
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <input type="checkbox" checked={draft.showOnWebsite}
                    onChange={e=>patch(row.id,{showOnWebsite:e.target.checked})}/>
                  Show on public website
                </label>
                <label className="text-xs font-bold text-slate-600">Application state
                  <select className={field} value={draft.applicationState}
                    onChange={e=>patch(row.id,{applicationState:e.target.value as State})}>
                    <option value="CLOSED">CLOSED</option>
                    <option value="UPCOMING">UPCOMING</option>
                    <option value="OPEN">OPEN</option>
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-600">Public sort order
                  <input type="number" min={0} max={10000} className={field}
                    value={draft.sortOrder} onChange={e=>patch(row.id,{sortOrder:Number(e.target.value)})}/>
                </label>
                <label className="text-xs font-bold text-slate-600 md:col-span-2">Update reason
                  <input className={field} required minLength={8} maxLength={500} value={draft.reason}
                    onChange={e=>patch(row.id,{reason:e.target.value})}
                    placeholder="Explain changes to website visibility or applications"/>
                </label>
              </div>
              {draft.applicationState==="OPEN"&&(!draft.showOnWebsite||!draft.isActive)&&<p role="alert"
                className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Applications can open only when this offering is both active and published.
              </p>}
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" disabled={busy||draft.reason.trim().length<8||
                  (draft.applicationState==="OPEN"&&(!draft.showOnWebsite||!draft.isActive))}
                  onClick={()=>void save(row)}
                  className="min-h-10 rounded-lg bg-blue-700 px-4 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">
                  {busy?"Saving…":"Save offering"}
                </button>
                <Link href="/interest" className="text-xs font-bold text-blue-700 hover:underline">View public registration</Link>
              </div>
            </div>}
          </div>;
        })}
    </section>
  </div>;
}
