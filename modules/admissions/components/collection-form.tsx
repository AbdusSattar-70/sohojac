"use client";
import {useRef,useState,useTransition,type FormEvent} from "react";
import {useRouter} from "next/navigation";
import {announceSaved} from "@/components/erp/action-panel";
import {collectAdmissionPayment} from "../lifecycle";

export function AdmissionCollectionForm({admissionId,due}:{admissionId:string;due:number}){
 const router=useRouter(),[pending,start]=useTransition();
 const [message,setMessage]=useState<{ok:boolean;text:string}|null>(null);
 const request=useRef(crypto.randomUUID());
 const submit=(e:FormEvent<HTMLFormElement>)=>{
  e.preventDefault();const form=new FormData(e.currentTarget);
  const amount=Number(form.get("amount"));
  if(!Number.isFinite(amount)||amount<=0||Math.round(amount*100)>Math.round(due*100)){
   setMessage({ok:false,text:"Enter a positive amount within the outstanding balance."});return;
  }
  start(async()=>{
   try{
    const result=await collectAdmissionPayment({
     admissionId,requestId:request.current,amount,
     method:String(form.get("method")),
     reference:String(form.get("reference")??""),
     reason:String(form.get("reason")??"")
    });
    setMessage({ok:result.ok,text:result.message});
    if(result.ok){
     request.current=crypto.randomUUID();
     announceSaved(result.message);
     router.refresh();
    }
   }catch{setMessage({ok:false,text:"Payment could not be confirmed. Check the invoice before retrying."});}
  });
 };
 return <form data-editor data-busy={pending?"true":"false"} onSubmit={submit}
  className="mt-4 space-y-3 rounded-xl border bg-card p-4 print:hidden">
  <fieldset disabled={pending} className="contents">
   <div>
    <h3 className="font-semibold">Record actual payment</h3>
    <p className="mt-1 text-sm text-muted-foreground">BDT {due.toFixed(2)} due. Posting creates a receipt, allocation and balanced ledger entries. Do not record promised payments here.</p>
   </div>
   <div className="grid gap-3 sm:grid-cols-2">
    <label className="block text-sm">Amount received (BDT)
     <input name="amount" type="number" min="0.01" max={due.toFixed(2)} step="0.01"
      defaultValue={due.toFixed(2)} required className="mt-1 min-h-11 w-full rounded-lg border bg-background p-3"/>
    </label>
    <label className="block text-sm">Payment method
     <select name="method" required defaultValue="CASH"
      className="mt-1 min-h-11 w-full rounded-lg border bg-background p-3">
      <option value="CASH">Cash</option><option value="BANK">Bank transfer</option><option value="MFS">Mobile financial service</option>
     </select>
    </label>
    <label className="block text-sm">Transaction reference (optional)
     <input name="reference" maxLength={160} placeholder="Bank / MFS transaction ID"
      className="mt-1 min-h-11 w-full rounded-lg border bg-background p-3"/>
    </label>
    <label className="block text-sm">Staff verification note
     <input name="reason" minLength={5} maxLength={500} required
      defaultValue="Verified funds actually received against initial admission invoice"
      className="mt-1 min-h-11 w-full rounded-lg border bg-background p-3"/>
    </label>
   </div>
   <button disabled={pending} className="min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50">
    {pending?"Posting receipt…":"Post payment and issue receipt"}
   </button>
   {message&&<p role={message.ok?"status":"alert"} className="text-sm">{message.text}</p>}
  </fieldset>
 </form>;
}
