"use client";
import {useCallback,useEffect,useState,type FormEvent} from "react";
import type {AssessmentRow,ExamEnrollment,ExamResult} from "@/lib/erp-assessments";
type Batch={id:string;name:string};
type FormData={batchId:string;title:string;subject:string;heldOn:string;maxMarks:number;reason:string};
const blank=():FormData=>({batchId:"",title:"",subject:"",heldOn:new Date().toISOString().slice(0,10),maxMarks:100,reason:""});
const field="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
export function AssessmentRegister(){
  const [items,setItems]=useState<AssessmentRow[]>([]);
  const [batches,setBatches]=useState<Batch[]>([]);
  const [enrollments,setEnrollments]=useState<ExamEnrollment[]>([]);
  const [results,setResults]=useState<ExamResult[]>([]);
  const [canPublish,setCanPublish]=useState(false);
  const [form,setForm]=useState(blank);
  const [marks,setMarks]=useState<Record<string,string>>({});
  const [reasons,setReasons]=useState<Record<string,string>>({});
  const [notes,setNotes]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const [message,setMessage]=useState("");
  const key=(a:string,e:string)=>a+":"+e;
  const refresh=useCallback(async()=>{
    setLoading(true);
    try{
      const r=await fetch("/api/staff/assessments",{credentials:"same-origin",cache:"no-store"});
      const d=await r.json() as {items?:AssessmentRow[];batches?:Batch[];enrollments?:ExamEnrollment[];
        results?:ExamResult[];canPublish?:boolean;error?:string};
      if(!r.ok)throw new Error(d.error||"Assessments unavailable");
      setItems(d.items||[]);setBatches(d.batches||[]);setEnrollments(d.enrollments||[]);
      setResults(d.results||[]);setCanPublish(Boolean(d.canPublish));
      setMarks(Object.fromEntries((d.results||[]).map(x=>[x.assessment_id+":"+x.enrollment_id,String(x.obtained_marks)])));
      setNotes(Object.fromEntries((d.results||[]).map(x=>[x.assessment_id+":"+x.enrollment_id,x.note||""])));
      setReasons({});
    }catch(e){setMessage(e instanceof Error?e.message:"Assessments unavailable");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  async function create(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(busy)return;setBusy(true);setMessage("");
    try{
      const r=await fetch("/api/staff/assessments",{method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});
      const d=await r.json() as {error?:string};
      if(!r.ok)throw new Error(d.error||"Cannot create assessment");
      setForm(blank());await refresh();setMessage("Assessment created as DRAFT.");
    }catch(e){setMessage(e instanceof Error?e.message:"Cannot create assessment");}
    finally{setBusy(false);}
  }
  async function record(row:AssessmentRow,enrollment:ExamEnrollment){
    if(busy)return;setBusy(true);setMessage("");
    const k=key(row.id,enrollment.enrollment_id);
    const current=results.find(r=>r.assessment_id===row.id&&r.enrollment_id===enrollment.enrollment_id);
    try{
      const value=Number(marks[k]);
      if(marks[k]===""||!Number.isInteger(value)||value<0||value>row.max_marks)throw new Error("Marks must be a whole number within the maximum.");
      const r=await fetch("/api/staff/assessments/"+row.id+"/results",{method:"POST",
        credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({enrollmentId:enrollment.enrollment_id,marks:value,
          expectedVersion:current?.version||0,note:notes[k]||"",reason:reasons[k]||""})});
      const d=await r.json() as {error?:string};
      if(!r.ok)throw new Error(d.error||"Could not record result");
      await refresh();setMessage("Student result recorded and audited.");
    }catch(e){setMessage(e instanceof Error?e.message:"Invalid result");}
    finally{setBusy(false);}
  }
  async function publish(row:AssessmentRow){
    if(busy)return;setBusy(true);setMessage("");
    try{
      const r=await fetch("/api/staff/assessments/"+row.id,{method:"PATCH",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},body:JSON.stringify({
          expectedVersion:row.version,reason:reasons[row.id]||"",
        })});
      const d=await r.json() as {error?:string};
      if(!r.ok)throw new Error(d.error||"Could not publish");
      await refresh();setMessage("Assessment published. Marks are now locked.");
    }catch(e){setMessage(e instanceof Error?e.message:"Could not publish");}
    finally{setBusy(false);}
  }
  return <div className="space-y-6">
    <header className="border-b border-slate-200 pb-5">
      <p className="text-xs font-extrabold uppercase tracking-widest text-blue-700">Academic performance</p>
      <h1 className="mt-1 text-2xl font-extrabold">Assessments & results</h1>
      <p className="mt-2 text-sm text-slate-600">Enter whole-number marks only for verified active enrollments. Every correction is version-controlled. Results cannot be published until all active batch students have been graded.</p>
    </header>
    {message&&<p role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{message}</p>}
    {canPublish&&<form onSubmit={create} className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-bold">Create assessment</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs font-bold">Active batch<select className={field} required value={form.batchId} onChange={e=>setForm(x=>({...x,batchId:e.target.value}))}>
          <option value="">Select batch</option>{batches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
        </select></label>
        <label className="text-xs font-bold">Assessment title<input className={field} required maxLength={160} value={form.title} onChange={e=>setForm(x=>({...x,title:e.target.value}))} placeholder="Monthly exam 1"/></label>
        <label className="text-xs font-bold">Subject<input className={field} required maxLength={120} value={form.subject} onChange={e=>setForm(x=>({...x,subject:e.target.value}))} placeholder="Mathematics"/></label>
        <label className="text-xs font-bold">Exam date<input className={field} required type="date" value={form.heldOn} onChange={e=>setForm(x=>({...x,heldOn:e.target.value}))}/></label>
        <label className="text-xs font-bold">Maximum marks<input className={field} required type="number" min={1} max={1000} value={form.maxMarks} onChange={e=>setForm(x=>({...x,maxMarks:Number(e.target.value)}))}/></label>
        <label className="text-xs font-bold sm:col-span-2 lg:col-span-3">Reason for assessment<input className={field} required minLength={8} maxLength={500} value={form.reason} onChange={e=>setForm(x=>({...x,reason:e.target.value}))}/></label>
      </div>
      <button type="submit" disabled={busy} className="mt-4 min-h-10 rounded-lg bg-blue-700 px-4 text-xs font-bold text-white disabled:opacity-50">Create draft exam</button>
    </form>}
    <section className="space-y-4">
      <h2 className="font-bold">Assessment register</h2>
      {loading?<p className="text-sm text-slate-500">Loading…</p>:items.length===0?<p className="rounded-xl bg-white p-5 text-sm">No assessments yet.</p>:items.map(row=>{
        const students=enrollments.filter(e=>e.batch_id===row.batch_id);
        const graded=students.filter(s=>results.some(r=>r.assessment_id===row.id&&r.enrollment_id===s.enrollment_id));
        return <article className="rounded-xl border border-slate-200 bg-white p-5" key={row.id}>
          <div className="flex flex-wrap justify-between gap-3">
            <div><h3 className="font-bold">{row.title} · {row.subject}</h3>
              <p className="mt-1 text-xs text-slate-600">{row.batch_name} · {row.held_on} · Maximum {row.max_marks}</p></div>
            <span className="text-xs font-extrabold text-blue-800">{row.status} · {graded.length}/{students.length} graded</span>
          </div>
          <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
            {students.map(student=>{
              const k=key(row.id,student.enrollment_id);
              const value=results.find(r=>r.assessment_id===row.id&&r.enrollment_id===student.enrollment_id);
              return <div key={student.enrollment_id} className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-[1fr_90px_1fr_auto] sm:items-end">
                <div><p className="text-sm font-bold">{student.student_name}</p><p className="text-xs text-slate-500">{student.student_no}</p></div>
                <label className="text-xs font-bold">Marks<input className={field} type="number" min={0} max={row.max_marks} disabled={row.status==="PUBLISHED"}
                  value={marks[k]??""} onChange={e=>setMarks(x=>({...x,[k]:e.target.value}))}/></label>
                {row.status==="DRAFT"?<label className="text-xs font-bold">Reason<input className={field} minLength={8} maxLength={500} value={reasons[k]||""} onChange={e=>setReasons(x=>({...x,[k]:e.target.value}))}/></label>:
                  <p className="text-xs font-bold text-blue-800">Published result</p>}
                {row.status==="DRAFT"&&<button type="button" disabled={busy||(reasons[k]||"").trim().length<8}
                  onClick={()=>void record(row,student)} className="min-h-10 rounded-lg bg-blue-700 px-4 text-xs font-bold text-white disabled:opacity-50">{value?"Correct":"Save"} marks</button>}
              </div>;
            })}
          </div>
          {canPublish&&row.status==="DRAFT"&&<div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
            <label className="min-w-[200px] flex-1 text-xs font-bold">Publication reason<input className={field} minLength={8} maxLength={500} value={reasons[row.id]||""} onChange={e=>setReasons(x=>({...x,[row.id]:e.target.value}))}/></label>
            <button type="button" disabled={busy||graded.length!==students.length||students.length===0||(reasons[row.id]||"").trim().length<8} onClick={()=>void publish(row)}
              className="min-h-10 rounded-lg bg-blue-700 px-4 text-xs font-bold text-white disabled:opacity-50">Publish all results</button>
          </div>}
        </article>;
      })}
    </section>
  </div>;
}
