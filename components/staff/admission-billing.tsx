"use client";
import {useState} from "react";
export function AdmissionBilling({id,version,onSuccess}:{
  id:string;version:number;onSuccess:()=>Promise<void>;
}){
  const [reason,setReason]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function issue(){
    if(busy||reason.trim().length<8)return;
    setBusy(true);setError("");
    try{
      const response=await fetch("/api/staff/admissions/"+encodeURIComponent(id)+"/bill",{
        method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({expectedVersion:version,reason}),
      });
      const data=await response.json() as {error?:string};
      if(!response.ok)throw new Error(data.error||"Could not issue initial bill");
      await onSuccess();
    }catch(e){setError(e instanceof Error?e.message:"Could not issue initial bill");}
    finally{setBusy(false);}
  }
  return <div className="mt-3 space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
    <p className="text-sm font-semibold text-amber-900">Accepted and ready for initial billing</p>
    <p className="text-xs leading-5 text-amber-900">This issues a traceable bill for the admission fee plus the first month’s tuition. Prices are copied from the approved fee plan. It does not enrol the student or receive payment.</p>
    <label className="block text-xs font-bold text-amber-900">Reason for issuing bill
      <input className="mt-1 block min-h-10 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm"
        value={reason} maxLength={500} onChange={e=>setReason(e.target.value)} placeholder="Verified initial billing after approval"/>
    </label>
    {error&&<p role="alert" className="text-xs text-red-800">{error}</p>}
    <button type="button" disabled={busy||reason.trim().length<8} onClick={()=>void issue()}
      className="min-h-10 rounded-lg bg-blue-700 px-4 text-xs font-bold text-white disabled:opacity-50">
      {busy?"Issuing…":"Issue initial bill"}
    </button>
  </div>;
}
