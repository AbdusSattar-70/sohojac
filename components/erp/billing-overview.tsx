"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {ArrowUpRight,CalendarClock,CheckCircle2,FileText,Search,Wallet} from "lucide-react";
import type {CollectionInvoice,CollectionReceipt} from "@/lib/erp-collections";

const taka=(paisa:number)=>new Intl.NumberFormat("en-BD",{style:"currency",currency:"BDT",minimumFractionDigits:2}).format(paisa/100);
type State="ALL"|"OUTSTANDING"|"PAID";
type Response={invoices?:CollectionInvoice[];receipts?:CollectionReceipt[];error?:string};
const badge=(status:string)=>status==="PAID"?"border-emerald-500/30 bg-emerald-500/10 text-emerald-300":status==="PARTIAL"?"border-amber-500/30 bg-amber-500/10 text-amber-300":"border-sky-500/30 bg-sky-500/10 text-sky-300";
export function BillingOverview(){
 const [invoices,setInvoices]=useState<CollectionInvoice[]>([]);
 const [receipts,setReceipts]=useState<CollectionReceipt[]>([]);
 const [query,setQuery]=useState("");
 const [filter,setFilter]=useState<State>("ALL");
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const refresh=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const res=await fetch("/api/staff/collections",{cache:"no-store",credentials:"same-origin"});
   const data=await res.json() as Response;
   if(!res.ok)throw new Error(data.error||"Billing records unavailable.");
   setInvoices(data.invoices??[]);setReceipts(data.receipts??[]);
  }catch(e){setError(e instanceof Error?e.message:"Billing records unavailable.");}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void refresh();},[refresh]);
 const totals=useMemo(()=>invoices.reduce((t,i)=>{
  t.billed+=i.amount_paisa;t.paid+=i.paid_paisa;
  t.due+=Math.max(0,i.amount_paisa-i.paid_paisa);return t;
 },{billed:0,paid:0,due:0}),[invoices]);
 const visible=useMemo(()=>invoices.filter(i=>{
  const due=Math.max(0,i.amount_paisa-i.paid_paisa);
  if(filter==="OUTSTANDING"&&due===0)return false;
  if(filter==="PAID"&&due!==0)return false;
  const needle=query.trim().toLowerCase();
  return !needle||[i.student_name,i.student_no,i.invoice_no].some(x=>x?.toLowerCase().includes(needle));
 }),[invoices,query,filter]);
 return <div className="space-y-7">
  <header className="flex flex-wrap items-start justify-between gap-4">
   <div><p className="text-xs font-bold uppercase tracking-[.18em] text-sky-300">Finance / Student accounts</p>
    <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Student billing & receivables</h1>
    <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Review recorded invoices, payments and balances. The figures below reflect the most recent 200 invoices returned by the ledger; they are not academy-wide totals when more exist.</p></div>
   <Link href="/dashboard/finance/collections" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-500 focus-visible:outline-2 focus-visible:outline-sky-300">Record a payment <ArrowUpRight className="size-4" aria-hidden="true"/></Link>
  </header>
  {error&&<div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">{error} <button type="button" className="ml-2 underline" onClick={()=>void refresh()}>Retry</button></div>}
  <div className="grid gap-3 sm:grid-cols-3">
   {([["Invoiced",totals.billed,FileText],["Collected",totals.paid,CheckCircle2],["Outstanding",totals.due,Wallet]] as const).map(([name,value,Icon])=>
    <article key={name} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
     <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{name}</p><Icon className="size-5 text-sky-300" aria-hidden="true"/></div>
     <p className="mt-3 break-all text-xl font-bold tabular-nums sm:text-2xl">{loading?"—":taka(value)}</p>
    </article>)}
  </div>
  <section className="overflow-hidden rounded-2xl border border-border bg-card">
   <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
    <label className="relative min-w-[200px] flex-1"><span className="sr-only">Search invoice, student name or ID</span><Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" aria-hidden="true"/>
     <input className="min-h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm" placeholder="Search invoice, student name or ID" value={query} onChange={e=>setQuery(e.target.value)}/></label>
    <label className="text-sm"><span className="sr-only">Filter invoice status</span><select aria-label="Filter invoice status" value={filter} onChange={e=>setFilter(e.target.value as State)} className="min-h-11 rounded-xl border border-border bg-background px-3">
     <option value="ALL">All invoices</option><option value="OUTSTANDING">Outstanding</option><option value="PAID">Fully paid</option></select></label>
    <button type="button" onClick={()=>void refresh()} disabled={loading} className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50">Refresh</button>
   </div>
   <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm">
    <thead className="bg-muted/40 text-muted-foreground"><tr>{["Invoice","Student","Issued","Billed","Paid","Due","Status"].map(x=><th key={x} scope="col" className="px-4 py-3 font-semibold">{x}</th>)}</tr></thead>
    <tbody>{visible.map(i=><tr key={i.id} className="border-t border-border/70 hover:bg-muted/20">
     <td className="px-4 py-3 font-semibold">{i.invoice_no}</td>
     <td className="px-4 py-3">{i.student_name}<p className="text-xs text-muted-foreground">{i.student_no}</p></td>
     <td className="px-4 py-3 tabular-nums">{i.issue_on}</td>
     <td className="px-4 py-3 tabular-nums">{taka(i.amount_paisa)}</td>
     <td className="px-4 py-3 tabular-nums">{taka(i.paid_paisa)}</td>
     <td className="px-4 py-3 font-semibold tabular-nums">{taka(Math.max(0,i.amount_paisa-i.paid_paisa))}</td>
     <td className="px-4 py-3"><span className={"inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold "+badge(i.status)}>{i.status}</span></td>
    </tr>)}</tbody>
   </table></div>
   {loading?<p role="status" className="p-6 text-sm text-muted-foreground">Loading invoices…</p>:!visible.length?<p className="p-6 text-sm text-muted-foreground">No invoices match this filter.</p>:<p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">Showing {visible.length} of {invoices.length} latest invoices · Data refreshes on request.</p>}
  </section>
  <section className="rounded-2xl border border-border bg-card p-5">
   <h2 className="flex items-center gap-2 text-lg font-bold"><CalendarClock className="size-5 text-sky-300" aria-hidden="true"/> Recent receipts</h2>
   {receipts.length?<div className="mt-4 space-y-2">{receipts.slice(0,8).map(r=><div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 p-3 text-sm"><div><p className="font-semibold">{r.receipt_no} · {r.student_name}</p><p className="text-xs text-muted-foreground">{r.invoice_no} · {r.payment_method} · {r.received_at}</p></div><strong className="tabular-nums">{taka(r.amount_paisa)}</strong></div>)}</div>:<p className="mt-3 text-sm text-muted-foreground">{loading?"Loading receipts…":"No posted receipts in the latest results."}</p>}
  </section>
 </div>;
}
