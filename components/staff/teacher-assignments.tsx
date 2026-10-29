"use client";
import {useCallback,useEffect,useState,type FormEvent} from "react";
import type {TeacherAssignment} from "@/lib/erp-teachers";
type Teacher={user_id:string;name:string;email:string};
type Batch={id:string;name:string};
const field="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
export function TeacherAssignments(){
  const [teachers,setTeachers]=useState<Teacher[]>([]),[batches,setBatches]=useState<Batch[]>([]);
  const [assignments,setAssignments]=useState<TeacherAssignment[]>([]);
  const [teacherUserId,setTeacherUserId]=useState(""),[batchId,setBatchId]=useState("");
  const [reason,setReason]=useState(""),[reasons,setReasons]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[message,setMessage]=useState("");
  const refresh=useCallback(async()=>{
    setLoading(true);
    try{
      const r=await fetch("/api/staff/teacher-assignments",{credentials:"same-origin",cache:"no-store"});
      const d=await r.json() as {teachers?:Teacher[];batches?:Batch[];assignments?:TeacherAssignment[];error?:string};
      if(!r.ok)throw new Error(d.error||"Teacher assignments unavailable");
      setTeachers(d.teachers||[]);setBatches(d.batches||[]);setAssignments(d.assignments||[]);
    }catch(e){setMessage(e instanceof Error?e.message:"Could not load assignments");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  async function assign(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(busy)return;setBusy(true);setMessage("");
    try{
      const r=await fetch("/api/staff/teacher-assignments",{method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},body:JSON.stringify({teacherUserId,batchId,reason})});
      const d=await r.json() as {error?:string};
      if(!r.ok)throw new Error(d.error||"Could not assign teacher");
      setTeacherUserId("");setBatchId("");setReason("");await refresh();setMessage("Teacher assigned to the selected batch.");
    }catch(e){setMessage(e instanceof Error?e.message:"Could not assign teacher");}
    finally{setBusy(false);}
  }
  async function change(row:TeacherAssignment){
    if(busy)return;setBusy(true);setMessage("");
    try{
      const r=await fetch("/api/staff/teacher-assignments/"+row.id,{
        method:"PATCH",credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({active:!row.active,expectedVersion:row.version,reason:reasons[row.id]||""})});
      const d=await r.json() as {error?:string};
      if(!r.ok)throw new Error(d.error||"Cannot change assignment");
      await refresh();setMessage("Assignment updated. Teacher classroom access reflects the change immediately.");
    }catch(e){setMessage(e instanceof Error?e.message:"Cannot change assignment");}
    finally{setBusy(false);}
  }
  return <div className="space-y-6">
    <header className="border-b border-slate-200 pb-5">
      <p className="text-xs font-extrabold uppercase tracking-widest text-blue-700">Staff management</p>
      <h1 className="mt-1 text-2xl font-extrabold">Teacher assignments</h1>
      <p className="mt-2 text-sm text-slate-600">Grant a verified TEACHER account access to a specific active batch. The teacher sees only assigned student names, class routine and published assessments—not guardian contacts or the wider ERP.</p>
    </header>
    {message&&<p role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{message}</p>}
    <form onSubmit={assign} className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-bold">Assign teacher</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold">Active teacher<select className={field} required value={teacherUserId} onChange={e=>setTeacherUserId(e.target.value)}>
          <option value="">Choose verified teacher</option>{teachers.map(t=><option key={t.user_id} value={t.user_id}>{t.name} · {t.email}</option>)}
        </select></label>
        <label className="text-xs font-bold">Active batch<select className={field} required value={batchId} onChange={e=>setBatchId(e.target.value)}>
          <option value="">Choose batch</option>{batches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
        </select></label>
        <label className="text-xs font-bold sm:col-span-2">Assignment reason<input className={field} required minLength={8} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
      </div>
      <button type="submit" disabled={busy} className="mt-4 min-h-10 rounded-lg bg-blue-700 px-4 text-xs font-bold text-white disabled:opacity-50">Assign teacher</button>
    </form>
    <section className="space-y-3">
      <h2 className="font-bold">Assignment register</h2>
      {loading?<p className="text-sm text-slate-500">Loading…</p>:assignments.length===0?<p className="rounded-xl bg-white p-5 text-sm">No teacher assignments.</p>:assignments.map(a=><article key={a.id} className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap justify-between gap-3">
          <div><h3 className="font-bold">{a.teacher_name}</h3><p className="text-xs text-slate-500">{a.teacher_email} · {a.batch_name}</p></div>
          <span className="text-xs font-bold text-blue-700">{a.active?"Active":"Revoked"}</span>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="min-w-[180px] flex-1 text-xs font-bold">Change reason<input className={field} minLength={8} maxLength={500} value={reasons[a.id]||""} onChange={e=>setReasons(x=>({...x,[a.id]:e.target.value}))}/></label>
          <button type="button" onClick={()=>void change(a)} disabled={busy||(reasons[a.id]||"").trim().length<8} className="min-h-10 rounded-lg border border-slate-300 px-4 text-xs font-bold disabled:opacity-50">{a.active?"Revoke":"Reactivate"}</button>
        </div>
      </article>)}
    </section>
  </div>;
}
