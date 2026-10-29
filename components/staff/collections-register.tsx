"use client";
import {useCallback,useEffect,useMemo,useState,type FormEvent} from "react";
import type {CollectionInvoice,CollectionReceipt} from "@/lib/erp-collections";
const field="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-blue-700";
const taka=(n:number)=>"৳"+(n/100).toFixed(2);
function paisa(text:string):number|null{
  if(!/^(0|[1-9]\d{0,6})(\.\d{1,2})?$/.test(text.trim()))return null;
  const [whole,cents=""]=text.trim().split(".");
  return Number(whole)*100+Number(cents.padEnd(2,"0"));
}
export function CollectionsRegister(){
  const [invoices,setInvoices]=useState<CollectionInvoice[]>([]);
  const [receipts,setReceipts]=useState<CollectionReceipt[]>([]);
  const [invoiceId,setInvoiceId]=useState("");
  const [amount,setAmount]=useState(""),[method,setMethod]=useState<"CASH"|"BANK"|"MFS">("CASH");
  const [reference,setReference]=useState(""),[reason,setReason]=useState("");
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const refresh=useCallback(async()=>{
    setLoading(true);
    try{
      const r=await fetch("/api/staff/collections",{cache:"no-store",credentials:"same-origin"});
      const d=await r.json() as {invoices?:CollectionInvoice[];receipts?:CollectionReceipt[];error?:string};
      if(!r.ok)throw new Error(d.error||"Collections unavailable");
      setInvoices(d.invoices||[]);setReceipts(d.receipts||[]);
    }catch(e){setMessage(e instanceof Error?e.message:"Collections unavailable");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  const outstanding=useMemo(()=>invoices.filter(i=>i.status!=="PAID"&&i.paid_paisa<i.amount_paisa),[invoices]);
  const selected=invoices.find(i=>i.id===invoiceId);
  async function collect(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(busy)return;
    const sum=paisa(amount);
    if(sum===null||sum<=0){setMessage("Enter a valid positive taka amount with at most two decimals.");return;}
    if(selected&&sum>selected.amount_paisa-selected.paid_paisa){setMessage("Payment exceeds the outstanding invoice amount.");return;}
    setBusy(true);setMessage("");
    try{
      const r=await fetch("/api/staff/collections",{method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({invoiceId,amountPaisa:sum,method,reference,reason})});
      const d=await r.json() as {error?:string;receiptNo?:string};
      if(!r.ok)throw new Error(d.error||"Could not record payment");
      setInvoiceId("");setAmount("");setReference("");setReason("");
      await refresh();setMessage("Payment allocated and posted. Receipt "+(d.receiptNo||"")+" created.");
    }catch(e){setMessage(e instanceof Error?e.message:"Payment was not recorded");}
    finally{setBusy(false);}
  }
  return <div className="space-y-6">
    <header className="border-b border-slate-200 pb-5">
      <p className="text-xs font-extrabold uppercase tracking-widest text-blue-700">Finance operations</p>
      <h1 className="mt-1 text-2xl font-extrabold">Tuition collections</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">Record real cash, bank or mobile financial service collections only after the payment is physically received. Every allocation updates the outstanding student invoice and posts a balanced, immutable double-entry journal.</p>
    </header>
    {message&&<p role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{message}</p>}
    <form onSubmit={collect} className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-bold">Record received payment</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="text-xs font-bold md:col-span-2">Outstanding student invoice<select className={field} required value={invoiceId} onChange={e=>setInvoiceId(e.target.value)}>
          <option value="">Choose unpaid invoice</option>{outstanding.map(i=><option key={i.id} value={i.id}>{i.student_name} · {i.invoice_no} · due {taka(i.amount_paisa-i.paid_paisa)}</option>)}
        </select></label>
        <label className="text-xs font-bold">Amount received (৳)<input className={field} required inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="2500.00"/></label>
        <label className="text-xs font-bold">Payment method<select className={field} value={method} onChange={e=>setMethod(e.target.value as "CASH"|"BANK"|"MFS")}>
          <option value="CASH">Cash</option><option value="BANK">Bank</option><option value="MFS">Mobile financial service</option>
        </select></label>
        <label className="text-xs font-bold md:col-span-2">Transaction reference (optional)<input className={field} value={reference} maxLength={160} onChange={e=>setReference(e.target.value)} placeholder="Bank/MFS transaction ID"/></label>
        <label className="text-xs font-bold md:col-span-3">Receipt posting reason<input className={field} required minLength={8} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Payment received and verified by cashier"/></label>
      </div>
      {selected&&<p className="mt-3 text-xs text-slate-600">Outstanding: {taka(selected.amount_paisa-selected.paid_paisa)}. Partial payment is allowed; overpayment is blocked.</p>}
      <button type="submit" disabled={busy||!invoiceId} className="mt-4 min-h-10 rounded-lg bg-blue-700 px-4 text-xs font-bold text-white disabled:opacity-50">{busy?"Posting…":"Post payment and generate receipt"}</button>
    </form>
    <section className="space-y-3">
      <h2 className="font-bold">Recent receipt records</h2>
      {loading?<p className="text-sm text-slate-500">Loading…</p>:receipts.length===0?<p className="rounded-xl bg-white p-5 text-sm">No collection receipts yet.</p>:
        receipts.map(p=><article key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <div><p className="text-sm font-bold">{p.receipt_no}</p><p className="text-xs text-slate-500">{p.student_name} · {p.invoice_no} · {p.payment_method}</p>
            <p className="text-xs text-slate-500">{p.received_at}{p.reference?" · "+p.reference:""}</p></div>
          <strong className="text-sm">{taka(p.amount_paisa)}</strong>
        </article>)}
    </section>
  </div>;
}
