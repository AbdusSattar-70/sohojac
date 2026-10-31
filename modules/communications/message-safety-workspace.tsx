"use client";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {useState,type FormEvent} from "react";

export type OutboxItem={id:string;student_id:string;student_no:string;full_name:string;
 template_key:string;status:"HELD"|"CANCELLED";created_at:string;opted_out:number};
export type StudentChoice={id:string;student_no:string;full_name:string;opted_out:number};

export function MessageSafetyWorkspace({messages,students,canManage}:{
 messages:OutboxItem[];students:StudentChoice[];canManage:boolean;
}){
 const router=useRouter();
 const [studentId,setStudentId]=useState("");
 const [reason,setReason]=useState("");
 const [busy,setBusy]=useState(false);
 const [queueStudent,setQueueStudent]=useState("");
 const [templateKey,setTemplateKey]=useState("GENERAL_REMINDER");
 const [consentAttested,setConsentAttested]=useState(false);
 // Preserve this identity on network errors so retry cannot enqueue twice.
 const [holdRequestId,setHoldRequestId]=useState("");
 const [feedback,setFeedback]=useState("");
 const [error,setError]=useState("");
 async function post(url:string,body:unknown){
  setBusy(true);setFeedback("");setError("");
  try{
   const response=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},
    credentials:"same-origin",body:JSON.stringify(body)});
   const value=(await response.json().catch(()=>({error:"Unexpected response"}))) as {error?:string};
   if(!response.ok)throw Error(String(value.error??"Action was not confirmed"));
   setFeedback(url.endsWith("opt-out")
    ?"Guardian opted out; any held requests were cancelled.": "Held message cancelled.");
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"The action was not confirmed");}
  finally{setBusy(false);}
 }
 function optOut(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(!canManage||busy||reason.trim().length<10||!studentId)return;
  void post("/api/staff/messages/opt-out",{studentId,reason:reason.trim()});
 }
 async function holdRequest(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(!canManage||busy||!queueStudent||!consentAttested)return;
  const requestId=holdRequestId||crypto.randomUUID();
  setHoldRequestId(requestId);
  setBusy(true);setFeedback("");setError("");
  try{
   const response=await fetch("/api/staff/messages",{
    method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},
    body:JSON.stringify({studentId:queueStudent,templateKey,requestId,consentAttested:true})
   });
   const value=(await response.json().catch(()=>({error:"Unexpected response"}))) as {error?:string;status?:string};
   if(!response.ok)throw Error(String(value.error??"Unable to confirm held request"));
   setHoldRequestId("");setConsentAttested(false);
   setFeedback("Message request is held. No SMS was sent.");
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Unable to confirm held request. Retry with the same identity.");}
  finally{setBusy(false);}
 }
 return <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
  <header className="space-y-2">
   <Link href="/dashboard/governance/audit" className="text-sm text-muted-foreground underline">← Audit trail</Link>
   <h1 className="text-2xl font-semibold">Guardian messages</h1>
   <p className="text-sm text-muted-foreground">Staff-only message safety desk. Requests are held, not sent.
    There is no provider connection or automatic dispatch. No guardian phone numbers are displayed here.</p>
  </header>
  <section role="status" className="rounded-xl border border-amber-700/50 bg-amber-950/20 p-4 text-sm">
   <strong>Delivery disabled.</strong> A queued request does not mean an SMS was sent or received.
   Opt-outs permanently suppress new requests. Provider activation requires separate review.
  </section>
  {error&&<p role="alert" className="rounded-lg border border-red-600/40 p-3 text-sm text-red-300">{error}</p>}
  {feedback&&<p role="status" className="rounded-lg border p-3 text-sm">{feedback}</p>}
  <section className="space-y-3 rounded-xl border p-4">
   <h2 className="font-semibold">Hold a message request</h2>
   <p className="text-sm text-muted-foreground">This records intent for staff review only; it does not send SMS.
    Confirm the guardian has explicitly agreed to this specific communication before staging a request.
    No message text or recipient number is accepted from the browser.</p>
   {canManage?<form onSubmit={holdRequest} className="grid gap-3 sm:grid-cols-2">
    <label className="space-y-1 text-sm">Active student
     <select required value={queueStudent} onChange={e=>{setQueueStudent(e.target.value);setHoldRequestId("");}}
      className="block w-full rounded-md border bg-background p-2">
      <option value="">Select student</option>
      {students.map(student=><option value={student.id} key={student.id} disabled={!!student.opted_out}>
       {student.student_no} — {student.full_name}{student.opted_out?" (SMS declined)":""}
      </option>)}
     </select>
    </label>
    <label className="space-y-1 text-sm">Approved template type
     <select value={templateKey} onChange={e=>{setTemplateKey(e.target.value);setHoldRequestId("");}}
      className="block w-full rounded-md border bg-background p-2">
      <option value="GENERAL_REMINDER">General reminder</option>
      <option value="ADMISSION_FOLLOWUP">Admission follow-up</option>
     </select>
    </label>
    <label className="flex items-start gap-2 text-sm sm:col-span-2">
     <input type="checkbox" required checked={consentAttested}
      onChange={e=>setConsentAttested(e.target.checked)} className="mt-1"/>
     <span>I verified the guardian's consent to receive this communication.
      I understand this request will remain held and no SMS will be sent.</span>
    </label>
    <button type="submit" disabled={busy||!queueStudent||!consentAttested}
     className="rounded-md border bg-secondary px-4 py-2 text-sm font-semibold disabled:opacity-50">
     Hold request (do not send)</button>
    {holdRequestId&&<p className="self-center text-xs text-muted-foreground">
     A previous attempt was not confirmed. Retrying uses the same request ID.</p>}
   </form>:<p className="text-sm text-muted-foreground">Request creation requires communications.manage.</p>}
  </section>
  <section className="space-y-3 rounded-xl border p-4">
   <h2 className="font-semibold">Guardian opt-out</h2>
   <p className="text-sm text-muted-foreground">Record a guardian's refusal or withdrawal of SMS consent.
    This action is permanent in this version and cancels their held messages. Select from the most recent 300 active students.</p>
   {canManage?<form onSubmit={optOut} className="grid gap-3 sm:grid-cols-2">
    <label className="space-y-1 text-sm">Student
     <select required value={studentId} onChange={e=>setStudentId(e.target.value)}
      className="block w-full rounded-md border bg-background p-2">
      <option value="">Select student</option>
      {students.map(s=><option key={s.id} disabled={!!s.opted_out} value={s.id}>
       {s.student_no} — {s.full_name}{s.opted_out?" (opted out)":""}
      </option>)}
     </select>
    </label>
    <label className="space-y-1 text-sm">Reason (10–240 characters)
     <input required minLength={10} maxLength={240} value={reason} onChange={e=>setReason(e.target.value)}
      placeholder="Guardian requested no SMS" className="block w-full rounded-md border bg-background p-2"/>
    </label>
    <button disabled={busy||!studentId||reason.trim().length<10}
     className="rounded-md bg-destructive p-2 font-semibold text-destructive-foreground disabled:opacity-50"
     type="submit">Record opt-out & cancel held requests</button>
   </form>:<p className="text-sm text-muted-foreground">Viewing only. Messaging changes require the communications.manage permission.</p>}
  </section>
  <section className="space-y-3">
   <h2 className="font-semibold">Latest message requests <span className="text-sm font-normal text-muted-foreground">(up to 100)</span></h2>
   <div className="overflow-x-auto rounded-xl border">
    <table className="w-full min-w-[620px] text-left text-sm">
     <thead className="border-b bg-muted/30"><tr>
      <th className="p-3">Student</th><th className="p-3">Template</th>
      <th className="p-3">Status</th><th className="p-3">Created</th><th className="p-3">Action</th>
     </tr></thead>
     <tbody>{messages.map(item=><tr key={item.id} className="border-b last:border-b-0">
      <td className="p-3"><span className="font-medium">{item.student_no}</span><p>{item.full_name}</p></td>
      <td className="p-3">{item.template_key.replaceAll("_"," ")}</td>
      <td className="p-3">{item.status}{item.opted_out?" · Opted out":""}</td>
      <td className="p-3">{new Date(item.created_at).toLocaleString("en-GB",{timeZone:"Asia/Dhaka"})}</td>
      <td className="p-3">{canManage&&item.status==="HELD"
       ?<button type="button" disabled={busy} onClick={()=>void post(
         "/api/staff/messages/"+encodeURIComponent(item.id)+"/cancel",{})}
         className="rounded-md border px-3 py-2 disabled:opacity-50">Cancel held</button>
       :<span className="text-muted-foreground">—</span>}</td>
     </tr>)}</tbody>
    </table>
    {!messages.length&&<p className="p-4 text-sm text-muted-foreground">No message requests have been staged.</p>}
   </div>
  </section>
 </main>;
}
