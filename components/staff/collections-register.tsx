"use client";
import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent} from "react";
import type {CollectionInvoice,CollectionReceipt} from "@/lib/erp-collections";
const field="mt-1 block min-h-10 w-full rounded-lg border border-input bg-background text-foreground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring";
const taka=(n:number)=>"৳"+(n/100).toFixed(2);
function paisa(text:string):number|null{
  if(!/^(0|[1-9]\d{0,6})(\.\d{1,2})?$/.test(text.trim()))return null;
  const [whole,cents=""]=text.trim().split(".");
  return Number(whole)*100+Number(cents.padEnd(2,"0"));
}
type PendingPayment={requestId:string;invoiceId:string;amountPaisa:number;method:"CASH"|"BANK"|"MFS";reference:string;reason:string};
export function CollectionsRegister(){
  const [invoices,setInvoices]=useState<CollectionInvoice[]>([]);
  const [receipts,setReceipts]=useState<CollectionReceipt[]>([]);
  const [invoiceId,setInvoiceId]=useState("");
  const [amount,setAmount]=useState(""),[method,setMethod]=useState<"CASH"|"BANK"|"MFS">("CASH");
  const [reference,setReference]=useState(""),[reason,setReason]=useState("");
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [actorId,setActorId]=useState(""),[canPost,setCanPost]=useState(false);
  const [unconfirmed,setUnconfirmed]=useState(false);
  const pending=useRef<PendingPayment|null>(null);
  const storageKey=(id:string)=>"sohojac:pending-payment:"+id;
  const refresh=useCallback(async()=>{
    setLoading(true);
    try{
      const r=await fetch("/api/staff/collections",{cache:"no-store",credentials:"same-origin"});
      const d=await r.json() as {invoices?:CollectionInvoice[];receipts?:CollectionReceipt[];error?:string;actorId?:string;canPost?:boolean};
      if(!r.ok)throw new Error(d.error||"Collections unavailable");
      setInvoices(d.invoices||[]);setReceipts(d.receipts||[]);
      setActorId(d.actorId??"");setCanPost(d.canPost===true);
    }catch(e){setMessage(e instanceof Error?e.message:"Collections unavailable");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  const outstanding=useMemo(()=>invoices.filter(i=>i.status!=="PAID"&&i.paid_paisa<i.amount_paisa),[invoices]);
  const selected=invoices.find(i=>i.id===invoiceId);
  useEffect(()=>{
    if(!actorId)return;
    pending.current=null;setUnconfirmed(false);
    setInvoiceId("");setAmount("");setReference("");setReason("");
    try{
      const raw=sessionStorage.getItem(storageKey(actorId));if(!raw)return;
      const d=JSON.parse(raw) as PendingPayment;
      if(!d||typeof d.requestId!=="string"||typeof d.invoiceId!=="string"||
        !Number.isSafeInteger(d.amountPaisa)||d.amountPaisa<1||d.amountPaisa>200000000||
        !["CASH","BANK","MFS"].includes(d.method)||typeof d.reference!=="string"||typeof d.reason!=="string")return;
      pending.current=d;setUnconfirmed(true);setInvoiceId(d.invoiceId);setAmount((d.amountPaisa/100).toFixed(2));
      setMethod(d.method);setReference(d.reference);setReason(d.reason);
      setMessage("An earlier payment needs confirmation. Retry this payment to recover its original receipt.");
    }catch{}
  },[actorId]);
  function keep(entry:PendingPayment|null){
    pending.current=entry;setUnconfirmed(entry!==null);
    try{if(actorId){if(entry)sessionStorage.setItem(storageKey(actorId),JSON.stringify(entry));else sessionStorage.removeItem(storageKey(actorId));}}catch{}
  }
  async function findReceipt(entry:PendingPayment){
    const r=await fetch("/api/staff/collections?requestId="+encodeURIComponent(entry.requestId),{cache:"no-store",credentials:"same-origin"});
    const d=await r.json() as {ok?:boolean;receiptNo?:string};
    if(!r.ok)throw new Error("Payment status could not be checked. Keep this entry and retry to confirm its outcome.");
    return r.ok&&d.ok===true?d:null;
  }
  async function confirmed(receiptNo?:string){
    keep(null);setInvoiceId("");setAmount("");setReference("");setReason("");
    await refresh();setMessage("Payment confirmed. Receipt "+(receiptNo??"")+" is recorded once.");
  }
  async function collect(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(busy||!canPost)return;
    const sum=paisa(amount);
    if(!pending.current){
      if(sum===null||sum<=0){setMessage("Enter a valid positive taka amount with at most two decimals.");return;}
      if(selected&&sum>selected.amount_paisa-selected.paid_paisa){setMessage("Payment exceeds the outstanding invoice amount.");return;}
      if(reason.trim().length<8){setMessage("Explain the receipt posting reason in at least eight characters.");return;}
    }
    const entry=pending.current??{requestId:crypto.randomUUID(),invoiceId,amountPaisa:sum!,method,reference,reason};
    keep(entry);setBusy(true);setMessage("");
    try{
      // A retry first asks for the durable result; absence never creates a new key.
      const previous=await findReceipt(entry);
      if(previous){await confirmed(previous.receiptNo);return;}
      const r=await fetch("/api/staff/collections",{method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},body:JSON.stringify(entry)});
      const d=await r.json() as {error?:string;receiptNo?:string;code?:string};
      if(!r.ok){
        if(d.code==="BALANCE"){keep(null);await refresh();}
        throw new Error(d.error||"Payment could not be confirmed. Retry this same payment.");
      }
      await confirmed(d.receiptNo);
    }catch(e){
      try{
        const saved=await findReceipt(entry);
        if(saved){await confirmed(saved.receiptNo);return;}
      }catch{}
      setMessage(e instanceof Error?e.message:"Payment status is unconfirmed. Retry this same payment or review receipts.");
    }finally{setBusy(false);}
  }
  return <div className="space-y-6">
    <header className="border-b border-border pb-5">
      <p className="text-xs font-extrabold uppercase tracking-widest text-primary">Finance operations</p>
      <h1 className="mt-1 text-2xl font-extrabold">Tuition collections</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Record real cash, bank or mobile financial service collections only after the payment is physically received. Every allocation updates the outstanding student invoice and posts a balanced, immutable double-entry journal.</p>
    </header>
    {message&&<p role="status" className="rounded-lg border border-border bg-muted p-3 text-sm text-foreground">{message}</p>}
    {canPost?<form onSubmit={collect} className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-bold">Record received payment</h2>
      <fieldset disabled={busy||unconfirmed} className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="text-xs font-bold md:col-span-2">Outstanding student invoice<select className={field} required value={invoiceId} onChange={e=>setInvoiceId(e.target.value)}>
          <option value="">Choose unpaid invoice</option>{outstanding.map(i=><option key={i.id} value={i.id}>{i.student_name} · {i.invoice_no} · due {taka(i.amount_paisa-i.paid_paisa)}</option>)}
        </select></label>
        <label className="text-xs font-bold">Amount received (৳)<input className={field} required inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="2500.00"/></label>
        <label className="text-xs font-bold">Payment method<select className={field} value={method} onChange={e=>setMethod(e.target.value as "CASH"|"BANK"|"MFS")}>
          <option value="CASH">Cash</option><option value="BANK">Bank</option><option value="MFS">Mobile financial service</option>
        </select></label>
        <label className="text-xs font-bold md:col-span-2">Transaction reference (optional)<input className={field} value={reference} maxLength={160} onChange={e=>setReference(e.target.value)} placeholder="Bank/MFS transaction ID"/></label>
        <label className="text-xs font-bold md:col-span-3">Receipt posting reason<input className={field} required minLength={8} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Payment received and verified by cashier"/></label>
      </fieldset>
      {selected&&<p className="mt-3 text-xs text-muted-foreground">Outstanding: {taka(selected.amount_paisa-selected.paid_paisa)}. Partial payment is allowed; overpayment is blocked.</p>}
      <button type="submit" disabled={busy||!invoiceId} className="mt-4 min-h-10 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-50">{busy?"Confirming…":unconfirmed?"Retry and confirm this payment":"Post payment and generate receipt"}</button>
    </form>:<p className="text-sm">You can view receipts. Payment posting requires permission.</p>}
    <section className="space-y-3">
      <h2 className="font-bold">Recent receipt records</h2>
      {loading?<p className="text-sm text-muted-foreground">Loading…</p>:receipts.length===0?<p className="rounded-xl bg-card p-5 text-sm">No collection receipts yet.</p>:
        receipts.map(p=><article key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
          <div><p className="text-sm font-bold">{p.receipt_no}</p><p className="text-xs text-muted-foreground">{p.student_name} · {p.invoice_no} · {p.payment_method}</p>
            <p className="text-xs text-muted-foreground">{p.received_at}{p.reference?" · "+p.reference:""}</p></div>
          <strong className="text-sm">{taka(p.amount_paisa)}</strong>
        </article>)}
    </section>
  </div>;
}
