"use client";
import {useCallback,useEffect,useState,type FormEvent} from "react";

type Row={
 id:string;staff_no:string;full_name:string;email:string|null;mobile:string|null;
 joined_on:string|null;status:string;role:string|null;linked_user_id:string|null;
 login_active:number|null;
};
const field="mt-1 block min-h-10 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100";
export function StaffDirectory(){
 const [items,setItems]=useState<Row[]>([]),[loading,setLoading]=useState(true);
 const [error,setError]=useState(""),[open,setOpen]=useState(false),[busy,setBusy]=useState(false);
 const refresh=useCallback(async()=>{
  setLoading(true);
  try{
   const res=await fetch("/api/staff/directory",{credentials:"same-origin",cache:"no-store"});
   const data=await res.json() as {items?:Row[];error?:string};
   if(!res.ok)throw new Error(data.error||"Cannot read staff register");
   setItems(data.items??[]);setError("");
  }catch(e){setError(e instanceof Error?e.message:"Staff register unavailable");}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void refresh();},[refresh]);
 async function create(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;
  setBusy(true);setError("");
  const form=event.currentTarget;
  const body=Object.fromEntries(new FormData(form).entries());
  try{
   const res=await fetch("/api/staff/directory",{
    method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
    body:JSON.stringify(body)
   });
   const data=await res.json() as {error?:string;item?:{staff_no:string}};
   if(!res.ok)throw new Error(data.error||"Could not create staff record");
   form.reset();setOpen(false);await refresh();
   setError("Staff created: "+(data.item?.staff_no??"Confirm in register"));
  }catch(e){setError(e instanceof Error?e.message:"Unable to create staff");}
  finally{setBusy(false);}
 }
 return <div className="space-y-6">
  <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
   <div>
    <p className="text-xs font-bold uppercase tracking-wider text-blue-300">People & workforce</p>
    <h1 className="text-2xl font-bold">Staff Register</h1>
    <p className="mt-2 max-w-3xl text-sm text-slate-400">
     Original permanent IDs use SA-STF-000001. An employee can have a staff record
     without an ERP login; a separate verified invitation is required to grant access.
    </p>
   </div>
   <button type="button" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white"
    onClick={()=>setOpen(v=>!v)}>{open?"Close form":"Register staff"}</button>
  </div>
  {error&&<p role="status" className="rounded-lg border border-slate-500 p-3 text-sm">{error}</p>}
  {open&&<form onSubmit={create} className="grid gap-3 rounded-xl border border-slate-700 bg-slate-900 p-5 sm:grid-cols-2">
   <h2 className="text-lg font-semibold sm:col-span-2">Create permanent staff record</h2>
   {([
    ["fullName","Full name",true],["email","Email (optional)",false],
    ["mobile","Primary mobile",false],["alternateMobile","Alternate mobile",false],
    ["address","Address",false],["emergencyContactName","Emergency contact name",false],
    ["emergencyContactMobile","Emergency contact mobile",false],["joinedOn","Joined on",false],
    ["notes","Staff notes",false],["reason","Creation reason (audited)",true]
   ] as const).map(([key,label,required])=><label key={key} className="text-sm">{label}
    {key==="notes"||key==="address"?<textarea name={key} className={field} rows={2} maxLength={key==="notes"?2000:600}/>:
    <input name={key} className={field} required={required}
     minLength={key==="reason"?8:required?2:undefined} maxLength={key==="reason"?500:undefined}
     type={key==="email"?"email":key==="joinedOn"?"date":"text"}/>}
   </label>)}
   <p className="text-xs text-slate-400 sm:col-span-2">
    A unique staff number will be assigned by D1 after saving. No login, role or invitation is created.
   </p>
   <button disabled={busy} type="submit" className="min-h-11 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-50 sm:col-span-2">
    {busy?"Registering…":"Create staff record"}
   </button>
  </form>}
  <div className="overflow-x-auto rounded-xl border border-slate-700">
   <table className="w-full min-w-[720px] text-sm">
    <thead className="border-b border-slate-700 bg-slate-900 text-left">
     <tr>{["Permanent Staff ID","Name","Responsibility","Contact","Employment","ERP account"].map(h=>
      <th key={h} scope="col" className="p-4">{h}</th>)}</tr>
    </thead>
    <tbody>{items.map(item=><tr key={item.id} className="border-b border-slate-800">
     <td className="p-4 font-mono font-bold">{item.staff_no}</td>
     <td className="p-4">{item.full_name}</td>
     <td className="p-4">{item.role??"Not assigned"}</td>
     <td className="p-4">{item.mobile??"—"}<p className="text-xs text-slate-400">{item.email??""}</p></td>
     <td className="p-4">{item.status}<p className="text-xs text-slate-400">{item.joined_on??""}</p></td>
     <td className="p-4">{item.linked_user_id?(item.login_active?"Active login":"Account inactive"):"No login"}</td>
    </tr>)}</tbody>
   </table>
   {loading?<p role="status" className="p-5">Loading staff…</p>:
   !items.length?<p className="p-5 text-slate-400">No staff records available.</p>:null}
  </div>
 </div>;
}
