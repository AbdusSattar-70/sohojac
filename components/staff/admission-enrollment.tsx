"use client";
import {useState} from "react";
export function AdmissionEnrollment({id,version,onSuccess}:{
  id:string;version:number;onSuccess:()=>Promise<void>;
}){
  const [reason,setReason]=useState("");
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  async function enroll(){
    if(busy||reason.trim().length<8)return;
    setBusy(true);setError("");
    try{
      const r=await fetch("/api/staff/admissions/"+encodeURIComponent(id)+"/enroll",{
        method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({expectedVersion:version,reason}),
      });
      const d=await r.json() as {error?:string};
      if(!r.ok)throw new Error(d.error||"Could not enroll student");
      await onSuccess();
    }catch(e){setError(e instanceof Error?e.message:"Could not enroll student");}
    finally{setBusy(false);}
  }
  return <div className="mt-4 space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
    <p className="text-sm font-semibold text-blue-900">Billing complete; enrollment pending</p>
    <p className="text-xs leading-5 text-blue-900">Enrollment creates one student ID, one active batch assignment, and a student-linked invoice. It does not record any payment. Capacity is checked again atomically before committing.</p>
    <label className="block text-xs font-bold text-blue-900">Reason for confirming enrollment
      <input className="mt-1 block min-h-10 w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm"
        value={reason} maxLength={500} onChange={e=>setReason(e.target.value)} placeholder="Final verification by operator"/>
    </label>
    {error&&<p role="alert" className="text-xs text-red-800">{error}</p>}
    <button type="button" disabled={busy||reason.trim().length<8} onClick={()=>void enroll()}
      className="min-h-10 rounded-lg bg-blue-700 px-4 text-xs font-bold text-white disabled:opacity-50">
      {busy?"Enrolling…":"Complete student enrollment"}
    </button>
  </div>;
}
