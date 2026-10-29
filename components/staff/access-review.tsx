"use client";

import {useCallback,useEffect,useState} from "react";

type State="PENDING"|"VERIFIED"|"DECLINED"|"INVITED"|"ACTIVE";
type Role="ADMIN"|"OPERATOR"|"TEACHER"|"ACCOUNTANT";
type Item={
  id:string; full_name:string; email:string; mobile:string; requested_role:Role;
  assigned_role:Role|null; purpose:string; status:State; review_note:string|null;
  created_at:string; reviewed_at:string|null; reviewed_by_name:string;
};
const input="mt-1.5 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-700";
export function AccessReview({isOwner}:{isOwner:boolean}) {
  const [filter,setFilter]=useState<"ALL"|State>("PENDING");
  const [items,setItems]=useState<Item[]>([]);
  const [roles,setRoles]=useState<Record<string,Role>>({});
  const [notes,setNotes]=useState<Record<string,string>>({});
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState<string|null>(null);
  const [message,setMessage]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const result=await fetch("/api/staff/access-requests?status="+filter,{cache:"no-store",credentials:"same-origin"});
      if(!result.ok)throw new Error("Cannot load access requests");
      const data=await result.json() as {items:Item[]};
      setItems(data.items);
      setRoles(Object.fromEntries(data.items.map(item=>[item.id,item.requested_role])));
    }catch{setMessage("Access requests are currently unavailable");setItems([]);}
    finally{setLoading(false);}
  },[filter]);
  useEffect(()=>{void load();},[load]);

  async function sendInvitation(item:Item) {
    if (busy) return;
    setBusy(item.id); setMessage("");
    try {
      const response = await fetch("/api/staff/access-requests/"+encodeURIComponent(item.id)+"/invite", {
        method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json"},body:"{}",
      });
      const data=await response.json() as {error?:string;message?:string};
      if(!response.ok)throw new Error(data.error||"Could not send invitation");
      setMessage(data.message||"Secure invitation sent to the approved address.");
      await load();
    }catch(error){setMessage(error instanceof Error?error.message:"Could not send invitation");}
    finally{setBusy(null);}
  }

  async function decide(item:Item,decision:"VERIFIED"|"DECLINED") {
    const assignedRole=roles[item.id]||item.requested_role;
    const note=(notes[item.id]||"").trim();
    if(note.length<10){setMessage("Write at least 10 characters explaining the verification decision.");return;}
    if(decision==="VERIFIED"&&assignedRole==="ACCOUNTANT"){
      setMessage("Accountant role needs the finance permission module before it can be assigned.");return;
    }
    setBusy(item.id);
    setMessage("");
    try {
      const response=await fetch("/api/staff/access-requests/"+encodeURIComponent(item.id),{
        method:"PATCH",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({decision,note,...(decision==="VERIFIED"?{assignedRole}:{})}),
      });
      if(!response.ok){
        const data=await response.json() as {error?:string};
        throw new Error(data.error||"Could not save decision");
      }
      setNotes(prev=>({...prev,[item.id]:""}));
      await load();
      setMessage("Request decision saved and audited. Verification does not yet create a login.");
    }catch(error){setMessage(error instanceof Error?error.message:"Unable to update request");}
    finally{setBusy(null);}
  }

  return <div className="space-y-6">
    <div className="border-b border-slate-200 pb-5">
      <p className="text-xs font-extrabold uppercase tracking-wider text-blue-700">Administration</p>
      <h1 className="mt-1 text-2xl font-extrabold text-slate-950">Staff access requests</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">Verify the applicant's identity and job responsibilities before assigning a role.
        Verification alone does not create a user or send an invitation.</p>
    </div>
    <div className="flex flex-wrap gap-3">
      <label className="text-sm font-semibold text-slate-600">Request status
        <select value={filter} onChange={e=>setFilter(e.target.value as typeof filter)} className={input}>
          {(["PENDING","VERIFIED","INVITED","ACTIVE","DECLINED","ALL"] as const).map(value=><option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <button type="button" disabled={loading} onClick={()=>void load()} className="self-end rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Refresh</button>
    </div>
    {message&&<p role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{message}</p>}
    {loading?<p className="p-5 text-sm text-slate-500">Loading review queue…</p>:
      items.length===0?<p className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">No matching staff access requests.</p>:
      <div className="space-y-4">
        {items.map(item=><section key={item.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">{item.full_name}</h2>
              <p className="mt-1 text-sm text-slate-600">{item.email} · {item.mobile}</p>
              <p className="mt-1 text-xs text-slate-500">Requested {item.requested_role} · {new Date(item.created_at).toLocaleString("en-BD",{timeZone:"Asia/Dhaka"})}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{item.status}</span>
          </div>
          <p className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">{item.purpose}</p>
          {item.status==="PENDING" ? <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(140px,1fr)_minmax(230px,2fr)]">
            <label className="text-xs font-bold text-slate-600">Verified responsibility
              <select className={input} value={roles[item.id]||item.requested_role}
                onChange={e=>setRoles(prev=>({...prev,[item.id]:e.target.value as Role}))}>
                <option value="TEACHER">Teacher</option>
                <option value="OPERATOR">Operator</option>
                {isOwner&&<option value="ADMIN">Administrator</option>}
                <option value="ACCOUNTANT" disabled>Accountant (pending finance permissions)</option>
              </select>
            </label>
            <label className="text-xs font-bold text-slate-600">Verification note (required)
              <textarea rows={2} minLength={10} maxLength={500} value={notes[item.id]||""}
                onChange={e=>setNotes(prev=>({...prev,[item.id]:e.target.value}))}
                placeholder="How identity and role were verified; or why declined"
                className={input+" py-2"}/>
            </label>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button type="button" disabled={busy!==null} onClick={()=>void decide(item,"VERIFIED")}
                className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">Verify request</button>
              <button type="button" disabled={busy!==null} onClick={()=>void decide(item,"DECLINED")}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Decline request</button>
            </div>
          </div>:<div className="mt-3 space-y-2 text-xs text-slate-600">
            <p>Assigned role: {item.assigned_role||"None"}</p>
            {item.review_note&&<p>Review: {item.review_note}</p>}
            <p>{item.reviewed_by_name ? "Reviewed by "+item.reviewed_by_name : "Pending a reviewer"}</p>
            {(item.status==="VERIFIED"||item.status==="INVITED") &&
              item.assigned_role!=="ACCOUNTANT" && (item.assigned_role!=="ADMIN"||isOwner) &&
              <button type="button" disabled={busy!==null} onClick={()=>void sendInvitation(item)}
                className="mt-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">
                {busy===item.id?"Sending…":item.status==="INVITED"?"Resend secure invitation":"Send secure invitation"}
              </button>}
          </div>}
        </section>)}
      </div>}
  </div>;
}
