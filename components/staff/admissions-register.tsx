"use client";
import {useCallback,useEffect,useState,type FormEvent} from "react";
import type {AdmissionRow} from "@/lib/erp-admissions";

type Offering={id:string;name:string;is_active:number};
type Batch={id:string;name:string;offering_id:string;capacity:number;occupied:number};
type Plan={id:string;title:string;offering_id:string;monthly_amount_paisa:number;admission_amount_paisa:number};
type Enquiry={id:string;reference:string;student_name:string;guardian_name:string;mobile:string;school_name:string|null;class_name:string;offering_id:string|null};
type Identity={studentName:string;classGrade:number;guardianName:string;guardianMobile:string;schoolName:string};
type Draft=Identity&{reason:string};
type Approval={batchId:string;feePlanId:string;consentVerified:boolean;reason:string};
const field="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-blue-700";
const blank=()=>({enquiryId:"",offeringId:"",studentName:"",classGrade:8,guardianName:"",guardianMobile:"",schoolName:"",reason:""});
const fromRow=(r:AdmissionRow):Draft=>({studentName:r.student_full_name,classGrade:r.class_grade,
  guardianName:r.guardian_full_name,guardianMobile:r.guardian_mobile,
  schoolName:r.school_name||"",reason:""});
const approval=():Approval=>({batchId:"",feePlanId:"",consentVerified:false,reason:""});
export function AdmissionsRegister(){
  const [rows,setRows]=useState<AdmissionRow[]>([]);
  const [offerings,setOfferings]=useState<Offering[]>([]);
  const [batches,setBatches]=useState<Batch[]>([]);
  const [feePlans,setFeePlans]=useState<Plan[]>([]);
  const [enquiries,setEnquiries]=useState<Enquiry[]>([]);
  const [canApprove,setCanApprove]=useState(false);
  const [newApp,setNewApp]=useState(blank);
  const [drafts,setDrafts]=useState<Record<string,Draft>>({});
  const [approvals,setApprovals]=useState<Record<string,Approval>>({});
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const [message,setMessage]=useState("");
  const refresh=useCallback(async()=>{
    setLoading(true);
    try{
      const r=await fetch("/api/staff/admissions",{credentials:"same-origin",cache:"no-store"});
      const d=await r.json() as {items?:AdmissionRow[];offerings?:Offering[];batches?:Batch[];
        feePlans?:Plan[];enquiries?:Enquiry[];canApprove?:boolean;error?:string};
      if(!r.ok)throw new Error(d.error||"Admissions unavailable");
      setRows(d.items||[]);setOfferings(d.offerings||[]);setBatches(d.batches||[]);
      setFeePlans(d.feePlans||[]);setEnquiries(d.enquiries||[]);setCanApprove(Boolean(d.canApprove));
      setDrafts(Object.fromEntries((d.items||[]).map(x=>[x.id,fromRow(x)])));
      setApprovals(Object.fromEntries((d.items||[]).map(x=>[x.id,approval()])));
    }catch(e){setMessage(e instanceof Error?e.message:"Admissions unavailable");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  const patchDraft=(id:string,p:Partial<Draft>)=>setDrafts(x=>({...x,[id]:{...x[id],...p}}));
  const patchApproval=(id:string,p:Partial<Approval>)=>setApprovals(x=>({...x,[id]:{...x[id],...p}}));
  function chooseEnquiry(id:string){
    const q=enquiries.find(x=>x.id===id);
    if(!q){setNewApp(x=>({...x,enquiryId:""}));return;}
    const match=q.class_name.match(/(?:class|grade)\s*(\d{1,2})/i);
    setNewApp(x=>({...x,enquiryId:id,studentName:q.student_name,
      guardianName:q.guardian_name,guardianMobile:q.mobile,
      schoolName:q.school_name||"",classGrade:match?Number(match[1]):x.classGrade,
      offeringId:q.offering_id||x.offeringId}));
  }
  async function create(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(busy)return;setBusy(true);setMessage("");
    try{
      const r=await fetch("/api/staff/admissions",{method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},body:JSON.stringify(newApp)});
      const d=await r.json() as {error?:string;applicationNo?:string};
      if(!r.ok)throw new Error(d.error||"Could not create application");
      setNewApp(blank());await refresh();setMessage("Application "+(d.applicationNo||"")+" created as DRAFT. No seat or billing record was created.");
    }catch(e){setMessage(e instanceof Error?e.message:"Unable to create application");}
    finally{setBusy(false);}
  }
  async function action(row:AdmissionRow,kind:"SAVE"|"REVIEW"|"ACCEPT"|"REJECT"){
    if(busy)return;setBusy(true);setMessage("");
    const data=kind==="SAVE"?{...drafts[row.id]}:
      kind==="ACCEPT"?{...approvals[row.id]}:
      {reason:kind==="REJECT"?approvals[row.id]?.reason:drafts[row.id]?.reason};
    try{
      const r=await fetch("/api/staff/admissions/"+encodeURIComponent(row.id),{
        method:"PATCH",credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({...data,action:kind,expectedVersion:row.version}),
      });
      const d=await r.json() as {error?:string;status?:string};
      if(!r.ok)throw new Error(d.error||"Could not advance application");
      await refresh();setMessage(row.application_no+" → "+(d.status||kind)+". Changes audited.");
    }catch(e){setMessage(e instanceof Error?e.message:"Could not advance application");}
    finally{setBusy(false);}
  }
  return <div className="space-y-6">
    <header className="border-b border-slate-200 pb-4">
      <p className="text-xs font-extrabold uppercase tracking-widest text-blue-700">Student admissions</p>
      <h1 className="mt-1 text-2xl font-extrabold">Admission applications</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">A public enquiry is never an admission. Prepare a private application, submit for review, then obtain owner/administrator approval after verifying the signed admission form. Approval does not create a student, invoice or reserve a seat.</p>
    </header>
    {message&&<p role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{message}</p>}
    <form onSubmit={create} className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-bold">Prepare an application</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="text-xs font-bold md:col-span-2">From public enquiry (optional)<select className={field} value={newApp.enquiryId} onChange={e=>chooseEnquiry(e.target.value)}>
          <option value="">Manual application</option>{enquiries.map(e=><option key={e.id} value={e.id}>{e.reference} · {e.student_name}</option>)}
        </select></label>
        <label className="text-xs font-bold">Offering<select className={field} required value={newApp.offeringId} onChange={e=>setNewApp(x=>({...x,offeringId:e.target.value}))}>
          <option value="">Select offering</option>{offerings.map(o=><option key={o.id} value={o.id}>{o.name}{o.is_active?"":" (inactive)"}</option>)}
        </select></label>
        <label className="text-xs font-bold">Student name<input className={field} required maxLength={160} value={newApp.studentName} onChange={e=>setNewApp(x=>({...x,studentName:e.target.value}))}/></label>
        <label className="text-xs font-bold">Class (1–12)<input className={field} required type="number" min={1} max={12} value={newApp.classGrade} onChange={e=>setNewApp(x=>({...x,classGrade:Number(e.target.value)}))}/></label>
        <label className="text-xs font-bold">School<input className={field} maxLength={160} value={newApp.schoolName} onChange={e=>setNewApp(x=>({...x,schoolName:e.target.value}))}/></label>
        <label className="text-xs font-bold">Guardian name<input className={field} required maxLength={160} value={newApp.guardianName} onChange={e=>setNewApp(x=>({...x,guardianName:e.target.value}))}/></label>
        <label className="text-xs font-bold">Guardian mobile<input className={field} required pattern="01[3-9][0-9]{8}" maxLength={11} inputMode="tel" value={newApp.guardianMobile} onChange={e=>setNewApp(x=>({...x,guardianMobile:e.target.value}))}/></label>
        <label className="text-xs font-bold md:col-span-3">Preparation reason<input className={field} required minLength={8} maxLength={500} value={newApp.reason} onChange={e=>setNewApp(x=>({...x,reason:e.target.value}))}/></label>
      </div>
      <button type="submit" disabled={busy} className="mt-4 min-h-10 rounded-lg bg-blue-700 px-4 text-sm font-bold text-white disabled:opacity-50">Create draft application</button>
    </form>
    <section className="space-y-3">
      <h2 className="font-bold">Application register</h2>
      {loading?<p className="text-sm text-slate-500">Loading…</p>:rows.length===0?<p className="rounded-xl bg-white p-5 text-sm">No formal applications yet.</p>:rows.map(row=>{
        const edit=drafts[row.id]||fromRow(row);
        const decision=approvals[row.id]||approval();
        const availableBatches=batches.filter(b=>b.offering_id===row.offering_id&&b.capacity>b.occupied);
        const availableFees=feePlans.filter(f=>f.offering_id===row.offering_id);
        return <article key={row.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="font-bold">{row.student_full_name}</h3>
              <p className="text-xs text-slate-500">{row.application_no} · {row.offering_name} · Class {row.class_grade} · {row.guardian_full_name}</p>
              <p className="text-xs text-slate-500">Guardian: {row.guardian_mobile}</p>
            </div>
            <span className="rounded-lg bg-blue-50 px-3 py-1 text-xs font-extrabold text-blue-800">{row.status}</span>
          </div>
          {row.status==="DRAFT"&&<div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
            <label className="text-xs font-bold">Student name<input className={field} value={edit.studentName} maxLength={160} onChange={e=>patchDraft(row.id,{studentName:e.target.value})}/></label>
            <label className="text-xs font-bold">Class<input className={field} type="number" min={1} max={12} value={edit.classGrade} onChange={e=>patchDraft(row.id,{classGrade:Number(e.target.value)})}/></label>
            <label className="text-xs font-bold">School<input className={field} value={edit.schoolName} maxLength={160} onChange={e=>patchDraft(row.id,{schoolName:e.target.value})}/></label>
            <label className="text-xs font-bold">Guardian<input className={field} value={edit.guardianName} maxLength={160} onChange={e=>patchDraft(row.id,{guardianName:e.target.value})}/></label>
            <label className="text-xs font-bold">Mobile<input className={field} value={edit.guardianMobile} maxLength={11} onChange={e=>patchDraft(row.id,{guardianMobile:e.target.value})}/></label>
            <label className="text-xs font-bold sm:col-span-3">Action reason<input className={field} value={edit.reason} minLength={8} maxLength={500} onChange={e=>patchDraft(row.id,{reason:e.target.value})}/></label>
            <div className="flex flex-wrap gap-2 sm:col-span-3">
              <button type="button" disabled={busy||edit.reason.trim().length<8} onClick={()=>void action(row,"SAVE")} className="min-h-10 rounded-lg border border-slate-300 px-4 text-xs font-bold disabled:opacity-50">Save identity corrections</button>
              <button type="button" disabled={busy||edit.reason.trim().length<8} onClick={()=>void action(row,"REVIEW")} className="min-h-10 rounded-lg bg-blue-700 px-4 text-xs font-bold text-white disabled:opacity-50">Submit for review</button>
            </div>
          </div>}
          {row.status==="REVIEW"&&<div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
            <p className="text-xs text-slate-500 sm:col-span-2">Owner/administrator verification required. Selected batch must be active; fees and available seats are checked again at acceptance.</p>
            {canApprove&&<>
              <label className="text-xs font-bold">Approved batch<select className={field} value={decision.batchId} onChange={e=>patchApproval(row.id,{batchId:e.target.value})}>
                <option value="">Choose active batch</option>{availableBatches.map(b=><option key={b.id} value={b.id}>{b.name} · {b.occupied}/{b.capacity}</option>)}
              </select></label>
              <label className="text-xs font-bold">Fee plan<select className={field} value={decision.feePlanId} onChange={e=>patchApproval(row.id,{feePlanId:e.target.value})}>
                <option value="">Choose active fee plan</option>{availableFees.map(f=><option key={f.id} value={f.id}>{f.title} · ৳{(f.monthly_amount_paisa/100).toFixed(2)}/month</option>)}
              </select></label>
              <label className="flex items-center gap-2 text-xs font-bold sm:col-span-2"><input type="checkbox" checked={decision.consentVerified} onChange={e=>patchApproval(row.id,{consentVerified:e.target.checked})}/> I verified the guardian and student signed admission documents</label>
              <label className="text-xs font-bold sm:col-span-2">Approval/rejection reason<input className={field} minLength={8} maxLength={500} value={decision.reason} onChange={e=>patchApproval(row.id,{reason:e.target.value})}/></label>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <button type="button" disabled={busy||!decision.consentVerified||!decision.batchId||!decision.feePlanId||decision.reason.trim().length<8} onClick={()=>void action(row,"ACCEPT")} className="min-h-10 rounded-lg bg-blue-700 px-4 text-xs font-bold text-white disabled:opacity-50">Accept application</button>
                <button type="button" disabled={busy||decision.reason.trim().length<8} onClick={()=>void action(row,"REJECT")} className="min-h-10 rounded-lg border border-red-300 px-4 text-xs font-bold text-red-700 disabled:opacity-50">Reject application</button>
              </div>
            </>}
            {!canApprove&&<p className="text-xs text-slate-500">Pending owner or administrator approval.</p>}
          </div>}
          {row.status==="ACCEPTED"&&<p className="mt-3 text-sm text-amber-800">Accepted; initial billing and enrollment are separate controlled steps. No student record or seat has been created yet.</p>}
          {row.status==="REJECTED"&&<p className="mt-3 text-sm text-slate-600">Rejected: {row.review_note}</p>}
        </article>;
      })}
    </section>
  </div>;
}
