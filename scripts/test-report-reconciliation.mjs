import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import {reportReconciliationSql} from "../lib/report-reconciliation-sql.ts";

function db(){
 const d=new DatabaseSync(":memory:");
 d.exec([
  "CREATE TABLE finance_journals(id TEXT PRIMARY KEY,status TEXT NOT NULL);",
  "CREATE TABLE finance_journal_lines(id TEXT PRIMARY KEY,journal_id TEXT,debit_paisa INTEGER,credit_paisa INTEGER);",
  "CREATE TABLE finance_payments(id TEXT PRIMARY KEY,payment_method TEXT,received_at TEXT,amount_paisa INTEGER);",
  "CREATE TABLE finance_allocations(id TEXT PRIMARY KEY,payment_id TEXT,amount_paisa INTEGER);",
 ].join("\n"));
 return d;
}
test("global debit-credit equality cannot hide offsetting unbalanced journals",()=>{
 const d=db();
 try{
  const j=d.prepare("INSERT INTO finance_journals(id,status) VALUES(?,?)");
  const l=d.prepare("INSERT INTO finance_journal_lines(id,journal_id,debit_paisa,credit_paisa) VALUES(?,?,?,?)");
  j.run("balanced","POSTED");
  l.run("l1","balanced",100,0);l.run("l2","balanced",0,100);
  j.run("debit-only","POSTED");l.run("l3","debit-only",150,0);
  j.run("credit-only","POSTED");l.run("l4","credit-only",0,150);
  j.run("empty","POSTED");
  j.run("draft","DRAFT");
  assert.equal(d.prepare("SELECT SUM(debit_paisa)-SUM(credit_paisa) diff FROM finance_journal_lines").get().diff,0);
  assert.equal(d.prepare(reportReconciliationSql.postedJournalCount).get().total,4);
  assert.equal(d.prepare(reportReconciliationSql.unbalancedPostedJournals).get().total,3);
 }finally{d.close();}
});
test("all receipts are examined, including more than 200 and different months",()=>{
 const d=db();
 try{
  const p=d.prepare("INSERT INTO finance_payments(id,payment_method,received_at,amount_paisa) VALUES(?,?,?,?)");
  const a=d.prepare("INSERT INTO finance_allocations(id,payment_id,amount_paisa) VALUES(?,?,?)");
  for(let i=0;i<251;i++){
   const id="r"+i;
   p.run(id,i%2?"CASH":"MFS","2026-10-12T12:00:00Z",100);
   if(i!==250)a.run("a"+i,id,100);
  }
  p.run("r-old","BANK","2026-09-18T12:00:00Z",500);
  assert.equal(d.prepare(reportReconciliationSql.unallocatedReceipts).get().total,2);
  const breakdown=d.prepare(reportReconciliationSql.paymentMethods).all("2026-10");
  assert.equal(breakdown.length,2);
  assert.equal(breakdown.reduce((s,r)=>s+r.receipts,0),251);
  assert.equal(breakdown.reduce((s,r)=>s+r.amountPaisa,0),25100);
 }finally{d.close();}
});
test("finance report does not relabel cash movement as accounting profit or use latest-200 shortcut",()=>{
 const api=readFileSync("app/api/staff/reports/route.ts","utf8");
 const ui=readFileSync("components/staff/management-report.tsx","utf8");
 const sql=readFileSync("lib/report-reconciliation-sql.ts","utf8");
 assert.match(api,/reportReconciliationSql\.unbalancedPostedJournals/);
 assert.match(api,/reportReconciliationSql\.unallocatedReceipts/);
 assert.match(api,/reportReconciliationSql\.paymentMethods/);
 assert.match(api,/ledgerBalanced:money\(debit\)===money\(credit\)&&money\(unbalancedJournals\)===0/);
 assert.match(ui,/not a profit and loss statement/);
 assert.match(ui,/Receipts needing allocation review/);
 assert.match(ui,/Recorded collections by payment method/);
 assert.doesNotMatch(ui,/bg-white|bg-slate-|text-slate-/);
 assert.doesNotMatch(sql,/\bLIMIT\s+200\b/i);
});
