"use client";
import {useEffect,useState} from "react";
import type {MyTeacherBatch,MyTeacherStudent,MyTeacherSession,MyTeacherExam} from "@/lib/erp-teachers";
type Data={batches:MyTeacherBatch[];students:MyTeacherStudent[];
  sessions:MyTeacherSession[];exams:MyTeacherExam[];error?:string};
export function TeacherWorkspace(){
  const [data,setData]=useState<Data|null>(null);
  const [loading,setLoading]=useState(true),[error,setError]=useState("");
  useEffect(()=>{
    let live=true;
    (async()=>{
      try{
        const r=await fetch("/api/teacher/classes",{credentials:"same-origin",cache:"no-store"});
        const v=await r.json() as Data;
        if(!r.ok)throw new Error(v.error||"Classroom unavailable");
        if(live)setData(v);
      }catch(e){if(live)setError(e instanceof Error?e.message:"Classroom unavailable");}
      finally{if(live)setLoading(false);}
    })();
    return ()=>{live=false;};
  },[]);
  return <div className="space-y-6">
    <header className="border-b border-slate-200 pb-5">
      <p className="text-xs font-extrabold uppercase tracking-widest text-blue-700">Teacher workspace</p>
      <h1 className="mt-1 text-2xl font-extrabold text-slate-950">My classes</h1>
      <p className="mt-2 text-sm text-slate-600">Only students, sessions and published assessments in batches assigned to your active teacher account are shown here.</p>
    </header>
    {loading&&<p className="text-sm text-slate-500">Loading…</p>}
    {error&&<p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {data&&data.batches.length===0&&<p className="rounded-xl border border-slate-200 bg-white p-6 text-sm">You have no active batch assignment. Contact the academy administrator.</p>}
    {data?.batches.map(b=><section key={b.id} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <div><h2 className="text-lg font-extrabold">{b.name}</h2><p className="text-xs text-slate-600">{b.offering_name}</p></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div><h3 className="mb-2 text-sm font-bold">Enrolled learners</h3>
          {(data.students.filter(s=>s.batch_id===b.id)).length?
            <ul className="space-y-2">{data.students.filter(s=>s.batch_id===b.id).map(s=><li key={s.student_no} className="rounded-lg bg-slate-50 p-3 text-sm">
              {s.student_name}<span className="ml-2 text-xs text-slate-500">{s.student_no} · Class {s.class_grade}</span>
            </li>)}</ul>:<p className="text-xs text-slate-500">No students yet.</p>}
        </div>
        <div><h3 className="mb-2 text-sm font-bold">Class sessions</h3>
          {data.sessions.filter(s=>s.batch_id===b.id).map(s=><article key={s.id} className="mb-2 rounded-lg bg-slate-50 p-3 text-sm">
            <p className="font-bold">{s.title} · {s.status}</p>
            <p className="text-xs text-slate-600">{s.class_on} · {s.starts_at}–{s.ends_at}</p>
          </article>)}
        </div>
      </div>
      <div><h3 className="mb-2 text-sm font-bold">Published assessments</h3>
        {data.exams.filter(e=>e.batch_id===b.id).length?
          <div className="grid gap-2 sm:grid-cols-2">{data.exams.filter(e=>e.batch_id===b.id).map(e=><div key={e.id} className="rounded-lg bg-slate-50 p-3 text-sm">
            <p className="font-bold">{e.title} · {e.subject}</p><p className="text-xs text-slate-600">{e.held_on} · Maximum {e.max_marks}</p>
          </div>)}</div>:<p className="text-xs text-slate-500">No published assessments.</p>}
      </div>
    </section>)}
  </div>;
}
