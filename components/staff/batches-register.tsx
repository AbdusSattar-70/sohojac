"use client";
import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import type {BatchRow} from "@/lib/erp-batches";

type Offering={id:string;name:string;is_active:number};
type Year={id:string;title:string;status:string};
type Edit={name:string;capacity:number;beginsOn:string;endsOn:string;nextStatus:BatchRow["status"];reason:string};
const field="mt-1 block min-h-10 w-full rounded-lg border border-input bg-background text-foreground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring";
const makeEdit=(row:BatchRow):Edit=>({name:row.name,capacity:row.capacity,
  beginsOn:row.begins_on||"",endsOn:row.ends_on||"",nextStatus:row.status,reason:""});
const blank=()=>({code:"",name:"",offeringId:"",yearId:"",capacity:12,beginsOn:"",endsOn:"",reason:""});
export function BatchesRegister(){
  const [items,setItems]=useState<BatchRow[]>([]);
  const [offerings,setOfferings]=useState<Offering[]>([]);
  const [years,setYears]=useState<Year[]>([]);
  const [canEdit,setCanEdit]=useState(false);
  const [create,setCreate]=useState(blank);
  const [edits,setEdits]=useState<Record<string,Edit>>({});
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState("");
  // Keep an intended operation's identity stable until the original outcome is known.
  // On failure the same unchanged payload is retried, never a fresh request UUID.
  const createIntent=useRef<{signature:string;requestId:string}|null>(null);
  const editIntents=useRef<Record<string,{signature:string;requestId:string}>>({});
  const identity=(previous:{signature:string;requestId:string}|null,signature:string)=>
    previous?.signature===signature?previous:{signature,requestId:crypto.randomUUID()};
  const refresh=useCallback(async()=>{
    setLoading(true);
    try{
      const response=await fetch("/api/staff/batches",{cache:"no-store",credentials:"same-origin"});
      const data=await response.json() as {items?:BatchRow[];offerings?:Offering[];years?:Year[];canEdit?:boolean;error?:string};
      if(!response.ok)throw new Error(data.error||"Batch register unavailable");
      setItems(data.items||[]);setOfferings(data.offerings||[]);setYears(data.years||[]);
      setCanEdit(Boolean(data.canEdit));
      setEdits(Object.fromEntries((data.items||[]).map(row=>[row.id,makeEdit(row)])));
    }catch(e){setMessage(e instanceof Error?e.message:"Unable to load batches");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  const patch=(id:string,part:Partial<Edit>)=>setEdits(x=>({...x,[id]:{...x[id],...part}}));
  async function add(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(busy)return;setBusy(true);setMessage("");
    try{
      const signature=JSON.stringify(create);
      const intent=identity(createIntent.current,signature);
      createIntent.current=intent;
      const r=await fetch("/api/staff/batches",{method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json","Idempotency-Key":intent.requestId},
        body:JSON.stringify({...create,requestId:intent.requestId})});
      const d=await r.json() as {error?:string};
      if(!r.ok)throw new Error(d.error||"Cannot create batch");
      createIntent.current=null;setCreate(blank());await refresh();setMessage("Batch saved as PLANNED. No seats have been reserved.");
    }catch(e){setMessage(e instanceof Error?e.message:"Cannot create batch");}
    finally{setBusy(false);}
  }
  async function save(row:BatchRow){
    if(busy)return;setBusy(true);setMessage("");
    try{
      const change={...edits[row.id],expectedVersion:row.version};
      const signature=JSON.stringify(change);
      const intent=identity(editIntents.current[row.id]??null,signature);
      editIntents.current[row.id]=intent;
      const r=await fetch("/api/staff/batches/"+encodeURIComponent(row.id),{
        method:"PATCH",credentials:"same-origin",
        headers:{"Content-Type":"application/json","Idempotency-Key":intent.requestId},
        body:JSON.stringify({...change,requestId:intent.requestId}),
      });
      const d=await r.json() as {error?:string};
      if(!r.ok)throw new Error(d.error||"Cannot save batch");
      delete editIntents.current[row.id];await refresh();setMessage("Batch updated. Change recorded in the audit trail.");
    }catch(e){setMessage(e instanceof Error?e.message:"Cannot save batch");}
    finally{setBusy(false);}
  }
  return <div className="space-y-6">
    <header className="border-b border-border pb-4">
      <p className="text-xs font-extrabold uppercase tracking-widest text-primary">Academic operations</p>
      <h1 className="mt-1 text-2xl font-extrabold text-foreground">Batch register</h1>
      <p className="mt-2 text-sm text-muted-foreground">Maximum 12 students per batch. A planned batch does not reserve seats or enrol students. Only authorized staff may activate or close batches.</p>
    </header>
    {message&&<p role="status" className="rounded-lg border border-border bg-muted p-3 text-sm text-foreground">{message}</p>}
    {canEdit&&<form onSubmit={add} className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-base font-bold">Create planned batch</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-bold">Batch code<input className={field} required maxLength={32} value={create.code} onChange={e=>setCreate(x=>({...x,code:e.target.value.toUpperCase()}))} placeholder="SSC27-A"/></label>
        <label className="text-xs font-bold">Batch name<input className={field} required maxLength={120} value={create.name} onChange={e=>setCreate(x=>({...x,name:e.target.value}))} placeholder="SSC Science Group A"/></label>
        <label className="text-xs font-bold">Programme offering<select className={field} required value={create.offeringId} onChange={e=>setCreate(x=>({...x,offeringId:e.target.value}))}>
          <option value="">Select offering</option>{offerings.map(o=><option key={o.id} value={o.id}>{o.name}{o.is_active?"":" (inactive)"}</option>)}
        </select></label>
        <label className="text-xs font-bold">Academic year<select className={field} value={create.yearId} onChange={e=>setCreate(x=>({...x,yearId:e.target.value}))}>
          <option value="">Unassigned</option>{years.map(y=><option key={y.id} value={y.id}>{y.title} · {y.status}</option>)}
        </select></label>
        <label className="text-xs font-bold">Capacity (1–12)<input type="number" className={field} required min={1} max={12} value={create.capacity} onChange={e=>setCreate(x=>({...x,capacity:Number(e.target.value)}))}/></label>
        <label className="text-xs font-bold">Starts on<input type="date" className={field} value={create.beginsOn} onChange={e=>setCreate(x=>({...x,beginsOn:e.target.value}))}/></label>
        <label className="text-xs font-bold">Ends on<input type="date" className={field} value={create.endsOn} onChange={e=>setCreate(x=>({...x,endsOn:e.target.value}))}/></label>
        <label className="text-xs font-bold lg:col-span-4">Reason for creation<input className={field} minLength={8} maxLength={500} required value={create.reason} onChange={e=>setCreate(x=>({...x,reason:e.target.value}))}/></label>
      </div>
      <button type="submit" disabled={busy} className="mt-4 min-h-10 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">{busy?"Saving…":"Create batch"}</button>
    </form>}
    <section className="space-y-4" aria-label="Batches">
      <h2 className="text-base font-bold">Batches</h2>
      {loading?<p className="text-sm text-muted-foreground">Loading…</p>:items.length===0?<p className="rounded-xl bg-card p-5 text-sm">No batches yet.</p>:
      items.map(row=>{
        const edit=edits[row.id]||makeEdit(row);
        const locked=row.status==="COMPLETED"||row.status==="CANCELLED";
        return <article key={row.id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <div><h3 className="font-bold">{row.name}</h3><p className="text-xs text-muted-foreground">{row.code} · {row.offering_name} · {row.year_title||"No year"}</p></div>
            <span className="text-xs font-bold text-primary">{row.status} · {row.enrolled_count}/{row.capacity} students</span>
          </div>
          {canEdit&&!locked&&<div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-4">
            <label className="text-xs font-bold sm:col-span-2">Name<input className={field} maxLength={120} value={edit.name} onChange={e=>patch(row.id,{name:e.target.value})}/></label>
            <label className="text-xs font-bold">Capacity<input className={field} type="number" min={Math.max(1,row.enrolled_count)} max={12} value={edit.capacity} onChange={e=>patch(row.id,{capacity:Number(e.target.value)})}/></label>
            <label className="text-xs font-bold">Status<select className={field} value={edit.nextStatus} onChange={e=>patch(row.id,{nextStatus:e.target.value as BatchRow["status"]})}>
              <option value={row.status}>{row.status}</option>
              {row.status==="PLANNED"&&<><option value="ACTIVE">ACTIVE</option><option value="CANCELLED">CANCELLED</option></>}
              {row.status==="ACTIVE"&&<option value="COMPLETED">COMPLETED</option>}
            </select></label>
            <label className="text-xs font-bold">Starts on<input className={field} type="date" value={edit.beginsOn} onChange={e=>patch(row.id,{beginsOn:e.target.value})}/></label>
            <label className="text-xs font-bold">Ends on<input className={field} type="date" value={edit.endsOn} onChange={e=>patch(row.id,{endsOn:e.target.value})}/></label>
            <label className="text-xs font-bold sm:col-span-4">Reason (required)<input className={field} minLength={8} maxLength={500} value={edit.reason} onChange={e=>patch(row.id,{reason:e.target.value})}/></label>
            <button type="button" disabled={busy||edit.reason.trim().length<8} onClick={()=>void save(row)} className="min-h-10 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-50">Save changes</button>
          </div>}
          {locked&&<p className="mt-2 text-xs text-muted-foreground">Closed batches cannot be reopened or changed.</p>}
        </article>;
      })}
    </section>
  </div>;
}
