"use client";
import {useCallback,useEffect,useState,type FormEvent} from "react";
import type {ExpenseRow} from "@/lib/erp-expenses";

const categoryCodes=["RENT","UTILITIES","TEACHING_MATERIALS","MARKETING","MAINTENANCE","TRANSPORT","OTHER"] as const;
type Category=(typeof categoryCodes)[number];
type FormData={category:Category;payee:string;description:string;spentOn:string;amount:string;
  method:"CASH"|"BANK"|"MFS";reason:string};
const blank=():FormData=>({category:"RENT",payee:"",description:"",
  spentOn:new Date().toISOString().slice(0,10),amount:"",method:"CASH",reason:""});
const field="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-blue-700";
const taka=(n:number)=>"৳"+(n/100).toFixed(2);
function parseTaka(s:string):number|null{
  if(!/^(0|[1-9]\d{0,6})(\.\d{1,2})?$/.test(s.trim()))return null;
  const [whole,cent=""]=s.trim().split(".");
  const value=Number(whole)*100+Number(cent.padEnd(2,"0"));
  return value>0?value:null;
}
export function ExpensesRegister(){
  const [items,setItems]=useState<ExpenseRow[]>([]);
  const [totals,setTotals]=useState<Array<{category:string;amount_paisa:number}>>([]);
  const [form,setForm]=useState<FormData>(blank);
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const [message,setMessage]=useState("");
  const refresh=useCallback(async()=>{
    setLoading(true);
    try{
      const r=await fetch("/api/staff/expenses",{credentials:"same-origin",cache:"no-store"});
      const d=await r.json() as {items?:ExpenseRow[];totals?:Array<{category:string;amount_paisa:number}>;error?:string};
      if(!r.ok)throw new Error(d.error||"Expenses unavailable");
      setItems(d.items||[]);setTotals(d.totals||[]);
    }catch(e){setMessage(e instanceof Error?e.message:"Cannot load expenses");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(busy)return;
    const amountPaisa=parseTaka(form.amount);
    if(amountPaisa===null){setMessage("Enter a valid positive amount, with at most two decimal places.");return;}
    setBusy(true);setMessage("");
    try{
      const r=await fetch("/api/staff/expenses",{method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({category:form.category,payee:form.payee,description:form.description,
          spentOn:form.spentOn,amountPaisa,method:form.method,reason:form.reason})});
      const d=await r.json() as {error?:string;reference?:string};
      if(!r.ok)throw new Error(d.error||"Could not post expense");
      setForm(blank());await refresh();
      setMessage("Operating expense "+(d.reference||"")+" posted to the ledger.");
    }catch(e){setMessage(e instanceof Error?e.message:"Expense not recorded");}
    finally{setBusy(false);}
  }
  return <div className="space-y-6">
    <header className="border-b border-slate-200 pb-5">
      <p className="text-xs font-extrabold uppercase tracking-widest text-blue-700">Finance operations</p>
      <h1 className="mt-1 text-2xl font-extrabold">Operating expenses</h1>
      <p className="mt-2 text-sm text-slate-600">Only post payments that have actually occurred. An expense generates a balanced, immutable accounting journal. Corrections will require a separate reversal workflow.</p>
    </header>
    {message&&<p role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">{message}</p>}
    <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-bold">Record approved operating expense</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs font-bold">Category<select className={field} value={form.category} onChange={e=>setForm(x=>({...x,category:e.target.value as Category}))}>
          {categoryCodes.map(c=><option key={c} value={c}>{c.replaceAll("_"," ")}</option>)}
        </select></label>
        <label className="text-xs font-bold">Payee or supplier<input className={field} required maxLength={160} value={form.payee} onChange={e=>setForm(x=>({...x,payee:e.target.value}))}/></label>
        <label className="text-xs font-bold">Date of payment<input className={field} required type="date" max={new Date().toISOString().slice(0,10)} value={form.spentOn} onChange={e=>setForm(x=>({...x,spentOn:e.target.value}))}/></label>
        <label className="text-xs font-bold">Amount paid (৳)<input className={field} required inputMode="decimal" value={form.amount} onChange={e=>setForm(x=>({...x,amount:e.target.value}))}/></label>
        <label className="text-xs font-bold">Payment method<select className={field} value={form.method} onChange={e=>setForm(x=>({...x,method:e.target.value as FormData["method"]}))}>
          <option value="CASH">Cash</option><option value="BANK">Bank</option><option value="MFS">Mobile financial services</option>
        </select></label>
        <label className="text-xs font-bold sm:col-span-2 lg:col-span-3">Description<input className={field} required minLength={3} maxLength={500} value={form.description} onChange={e=>setForm(x=>({...x,description:e.target.value}))}/></label>
        <label className="text-xs font-bold sm:col-span-2 lg:col-span-3">Posting reason<input className={field} required minLength={8} maxLength={500} value={form.reason} onChange={e=>setForm(x=>({...x,reason:e.target.value}))}/></label>
      </div>
      <button className="mt-4 min-h-10 rounded-lg bg-blue-700 px-4 text-xs font-bold text-white disabled:opacity-50" type="submit" disabled={busy}>{busy?"Posting…":"Post expense"}</button>
    </form>
    <section className="space-y-3">
      <h2 className="font-bold">Expense totals by category</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {totals.length?totals.map(t=><div className="rounded-xl border border-slate-200 bg-white p-4" key={t.category}>
          <p className="text-xs font-bold text-slate-500">{t.category.replaceAll("_"," ")}</p>
          <p className="mt-2 text-xl font-extrabold">{taka(t.amount_paisa)}</p>
        </div>):<p className="text-sm text-slate-500">No expenses recorded.</p>}
      </div>
      <h2 className="pt-3 font-bold">Recent expense records</h2>
      {loading?<p className="text-sm text-slate-500">Loading…</p>:items.map(e=><article key={e.id} className="flex flex-wrap justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div><p className="text-sm font-bold">{e.description}</p><p className="mt-1 text-xs text-slate-600">{e.reference} · {e.category} · {e.spent_on}</p>
          <p className="text-xs text-slate-500">{e.payee} · {e.payment_method} · Approved by {e.approved_name||"Staff"}</p></div>
        <strong className="text-sm">{taka(e.amount_paisa)}</strong>
      </article>)}
    </section>
  </div>;
}
