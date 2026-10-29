"use client";
import {useCallback,useEffect,useState,type FormEvent} from "react";
import type {FeePlanRow} from "@/lib/erp-fee-plans";

type Offering={id:string;name:string};
type Edit={title:string;monthly:string;admission:string;active:boolean;reason:string};
const cls="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-blue-700";
const taka=(v:number)=> (v/100).toFixed(2);
function paisa(value:string):number|null{
  if(!/^(0|[1-9]\d{0,6})(\.\d{1,2})?$/.test(value.trim()))return null;
  const [whole,fraction=""]=value.trim().split(".");
  return Number(whole)*100+Number(fraction.padEnd(2,"0"));
}
const asEdit=(r:FeePlanRow):Edit=>({title:r.title,monthly:taka(r.monthly_amount_paisa),
  admission:taka(r.admission_amount_paisa),active:r.active===1,reason:""});
const blank=()=>({offeringId:"",title:"",monthly:"",admission:"0",reason:""});
export function FeePlansRegister(){
  const [rows,setRows]=useState<FeePlanRow[]>([]);
  const [offerings,setOfferings]=useState<Offering[]>([]);
  const [canEdit,setCanEdit]=useState(false);
  const [newPlan,setNewPlan]=useState(blank);
  const [edits,setEdits]=useState<Record<string,Edit>>({});
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const [message,setMessage]=useState("");
  const refresh=useCallback(async()=>{
    setLoading(true);
    try{
      const response=await fetch("/api/staff/fee-plans",{credentials:"same-origin",cache:"no-store"});
      const data=await response.json() as {items?:FeePlanRow[];offerings?:Offering[];canEdit?:boolean;error?:string};
      if(!response.ok)throw new Error(data.error||"Cannot load fee plans");
      setRows(data.items||[]);setOfferings(data.offerings||[]);setCanEdit(Boolean(data.canEdit));
      setEdits(Object.fromEntries((data.items||[]).map(r=>[r.id,asEdit(r)])));
    }catch(e){setMessage(e instanceof Error?e.message:"Cannot load fee plans");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  const patch=(id:string,change:Partial<Edit>)=>setEdits(prev=>({...prev,[id]:{...prev[id],...change}}));
  async function add(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(busy)return;
    const monthly=paisa(newPlan.monthly),admission=paisa(newPlan.admission);
    if(monthly===null||admission===null){setMessage("Enter valid taka amounts (up to 2 decimal places).");return;}
    setBusy(true);setMessage("");
    try{
      const r=await fetch("/api/staff/fee-plans",{method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},body:JSON.stringify({
          offeringId:newPlan.offeringId,title:newPlan.title,
          monthlyAmountPaisa:monthly,admissionAmountPaisa:admission,reason:newPlan.reason,
        })});
      const d=await r.json() as {error?:string};
      if(!r.ok)throw new Error(d.error||"Unable to create fee plan");
      setNewPlan(blank());await refresh();setMessage("Fee plan created; no student has been billed.");
    }catch(e){setMessage(e instanceof Error?e.message:"Unable to create fee plan");}
    finally{setBusy(false);}
  }
  async function save(row:FeePlanRow){
    const edit=edits[row.id]||asEdit(row);
    const monthly=paisa(edit.monthly),admission=paisa(edit.admission);
    if(monthly===null||admission===null){setMessage("Enter valid taka amounts.");return;}
    setBusy(true);setMessage("");
    try{
      const r=await fetch("/api/staff/fee-plans/"+encodeURIComponent(row.id),{
        method:"PATCH",credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({title:edit.title,monthlyAmountPaisa:monthly,
          admissionAmountPaisa:admission,active:edit.active,reason:edit.reason,expectedVersion:row.version}),
      });
      const d=await r.json() as {error?:string};
      if(!r.ok)throw new Error(d.error||"Unable to save fee plan");
      await refresh();setMessage("Fee plan saved. Existing invoices retain their original amounts.");
    }catch(e){setMessage(e instanceof Error?e.message:"Unable to save fee plan");}
    finally{setBusy(false);}
  }
  return <div className="space-y-6">
    <header className="border-b border-slate-200 pb-5">
      <p className="text-xs font-extrabold uppercase tracking-widest text-blue-700">Fees & finance</p>
      <h1 className="mt-1 text-2xl font-extrabold text-slate-950">Fee plans</h1>
      <p className="mt-2 text-sm text-slate-600">Set monthly and one-time admission fees per offering. Amounts use exact integer paisa. Creating a plan never automatically issues a bill.</p>
    </header>
    {message&&<p role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{message}</p>}
    {canEdit&&<form onSubmit={add} className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-base font-bold">New fee plan</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-bold">Offering<select className={cls} value={newPlan.offeringId} required onChange={e=>setNewPlan(x=>({...x,offeringId:e.target.value}))}>
          <option value="">Choose offering</option>{offerings.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
        </select></label>
        <label className="text-xs font-bold">Plan name<input className={cls} required maxLength={120} value={newPlan.title} onChange={e=>setNewPlan(x=>({...x,title:e.target.value}))} placeholder="Standard monthly"/></label>
        <label className="text-xs font-bold">Monthly fee (৳)<input className={cls} required inputMode="decimal" value={newPlan.monthly} onChange={e=>setNewPlan(x=>({...x,monthly:e.target.value}))} placeholder="2500.00"/></label>
        <label className="text-xs font-bold">Admission fee (৳)<input className={cls} required inputMode="decimal" value={newPlan.admission} onChange={e=>setNewPlan(x=>({...x,admission:e.target.value}))}/></label>
        <label className="text-xs font-bold sm:col-span-2 lg:col-span-4">Reason<input className={cls} required minLength={8} maxLength={500} value={newPlan.reason} onChange={e=>setNewPlan(x=>({...x,reason:e.target.value}))}/></label>
      </div>
      <button type="submit" disabled={busy} className="mt-4 min-h-10 rounded-lg bg-blue-700 px-4 text-sm font-bold text-white disabled:opacity-50">Create fee plan</button>
    </form>}
    <section className="space-y-3">
      <h2 className="text-base font-bold">Fee plan register</h2>
      {loading?<p className="text-sm text-slate-500">Loading…</p>:rows.length===0?<p className="rounded-xl bg-white p-5 text-sm">No fee plans configured.</p>:
      rows.map(row=>{
        const edit=edits[row.id]||asEdit(row);
        return <article key={row.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap justify-between gap-3">
            <div><h3 className="font-bold">{row.title}</h3><p className="text-xs text-slate-500">{row.offering_name} · Version {row.version}</p></div>
            <div className="text-right text-sm font-bold">৳{taka(row.monthly_amount_paisa)} / month
              <p className="text-xs font-normal text-slate-500">৳{taka(row.admission_amount_paisa)} admission · {row.active?"Active":"Inactive"}</p>
            </div>
          </div>
          {canEdit&&<div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-4">
            <label className="text-xs font-bold sm:col-span-2">Name<input className={cls} value={edit.title} maxLength={120} onChange={e=>patch(row.id,{title:e.target.value})}/></label>
            <label className="text-xs font-bold">Monthly fee (৳)<input className={cls} inputMode="decimal" value={edit.monthly} onChange={e=>patch(row.id,{monthly:e.target.value})}/></label>
            <label className="text-xs font-bold">Admission fee (৳)<input className={cls} inputMode="decimal" value={edit.admission} onChange={e=>patch(row.id,{admission:e.target.value})}/></label>
            <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={edit.active} onChange={e=>patch(row.id,{active:e.target.checked})}/> Active for new admissions</label>
            <label className="text-xs font-bold sm:col-span-4">Update reason<input className={cls} required minLength={8} maxLength={500} value={edit.reason} onChange={e=>patch(row.id,{reason:e.target.value})}/></label>
            <button type="button" disabled={busy||edit.reason.trim().length<8} onClick={()=>void save(row)} className="min-h-10 rounded-lg bg-blue-700 px-4 text-xs font-bold text-white disabled:opacity-50">Save changes</button>
          </div>}
        </article>;
      })}
    </section>
  </div>;
}
