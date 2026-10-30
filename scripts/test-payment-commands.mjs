import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, afterEach, test } from "node:test";
import { recordStudentPayment, findStudentPaymentResult } from "../modules/finance/payments/record-payment.ts";

const owner="owner-payments",operator="operator-payments";
const student="11111111-1111-4111-8111-111111111111";
const otherStudent="22222222-2222-4222-8222-222222222222";
const invoice="33333333-3333-4333-8333-333333333333";
const otherInvoice="44444444-4444-4444-8444-444444444444";
const admission="55555555-5555-4555-8555-555555555555";
let db,folder,files=[];
const actor={profileId:owner,permissions:["finance.payments.post"]};
const input=(patch={})=>({requestId:crypto.randomUUID(),invoiceId:invoice,amountPaisa:200,
 method:"CASH",reference:"",reason:"Received and verified payment",...patch});
function boundary(database,hooks={}){
 let lost=false;
 return {prepare(sql){return {bind(...values){return {
  async first(){hooks.read?.(sql);return database.prepare(sql).get(...values)??null;},
  async all(){
   if(sql.startsWith("INSERT INTO finance_payment_commands"))await hooks.beforeWrite?.();
   const result={success:true,results:database.prepare(sql).all(...values)};
   if(hooks.loseResponse&&!lost&&sql.startsWith("INSERT INTO finance_payment_commands")){
    lost=true;throw Error("Transport lost after commit");
   }
   return result;
  }
 };}};}};
}
const n=table=>db.prepare("SELECT COUNT(*) AS n FROM "+table).get().n;
const balances=()=>db.prepare("SELECT id,amount_paisa,paid_paisa,status FROM finance_invoices ORDER BY id").all();
const ledger=()=>db.prepare("SELECT SUM(debit_paisa) AS debit,SUM(credit_paisa) AS credit FROM finance_journal_lines").get();
beforeEach(()=>{
 folder=fs.mkdtempSync(path.join(os.tmpdir(),"sohojac-payment-"));
 db=new DatabaseSync(path.join(folder,"ledger.sqlite"));files=[db];db.exec("PRAGMA foreign_keys=ON");
 for(const name of fs.readdirSync("migrations/history").filter(n=>/^\d{4}_.*\.sql$/.test(n)&&Number(n.slice(0,4))<=35).sort())
  db.exec(fs.readFileSync(path.join("migrations/history",name),"utf8"));
 db.exec(fs.readFileSync("migrations/history/0036_operator_payment_commands.sql","utf8"));
 for(const [id,role]of[[owner,"OWNER"],[operator,"OPERATOR"]]){
  db.prepare('INSERT INTO "user"(id,name,email,"createdAt","updatedAt","emailVerified") VALUES (?,?,?,?,?,1)')
   .run(id,id,id+"@example.invalid",0,0);
  db.prepare("INSERT INTO staff_memberships(user_id,role,active) VALUES (?,?,1)").run(id,role);
 }
 db.prepare("INSERT INTO erp_permission_grants(user_id,permission) VALUES (?,'finance.payments.post')").run(operator);
 for(const [id,no]of[[student,"SA-000001"],[otherStudent,"SA-000002"]])
  db.prepare("INSERT INTO academy_students(id,student_no,full_name,guardian_name,guardian_mobile) VALUES (?,?,?,?,?)")
   .run(id,no,"Synthetic Student","Synthetic Guardian","01700000000");
 for(const [id,s,no]of[[invoice,student,"INV-A"],[otherInvoice,otherStudent,"INV-B"]])
  db.prepare("INSERT INTO finance_invoices(id,invoice_no,student_id,issue_on,amount_paisa,status,created_by) VALUES (?,?,?,'2026-10-30',1000,'ISSUED',?)")
   .run(id,no,s,owner);
});
afterEach(()=>{for(const f of files)f.close();fs.rmSync(folder,{recursive:true,force:true});});

test("named posting permission rejects before domain reads; invalid requests cannot post",async()=>{
 let reads=0;
 assert.equal((await recordStudentPayment(boundary(db,{read:()=>reads++}),{profileId:operator,permissions:[]},input())).code,"FORBIDDEN");
 assert.equal(reads,0);
 for(const patch of[{requestId:undefined},{requestId:"bad"},{amountPaisa:0},{amountPaisa:1.2},{amountPaisa:NaN},
  {amountPaisa:200000001},{method:"CARD"},{reason:"x"},{admissionId:admission},{actorId:owner}]){
  assert.equal((await recordStudentPayment(boundary(db),actor,input(patch))).code,"INVALID");
 }
 assert.equal(n("finance_payments"),0);
});
test("identical retries return one durable receipt, allocation, audit and balanced journal",async()=>{
 const body=input();const a=await recordStudentPayment(boundary(db),actor,body);
 const b=await recordStudentPayment(boundary(db),actor,{...body});
 assert.equal(a.ok,true);assert.equal(b.ok,true);assert.equal(a.id,b.id);assert.equal(a.receiptNo,b.receiptNo);
 assert.equal(a.replayed,false);assert.equal(b.replayed,true);assert.equal(a.remainingDuePaisa,800);
 assert.equal(n("finance_payments"),1);assert.equal(n("finance_allocations"),1);
 assert.equal(n("finance_payment_commands"),1);assert.equal(n("erp_audit_events"),1);
 assert.equal(n("finance_journals"),3);assert.equal(ledger().debit,ledger().credit);
 assert.equal(db.prepare("SELECT paid_paisa FROM finance_invoices WHERE id=?").get(invoice).paid_paisa,200);
 assert.equal(db.prepare("SELECT paid_paisa FROM finance_invoices WHERE id=?").get(otherInvoice).paid_paisa,0);
 assert.equal(db.prepare("PRAGMA foreign_key_check").all().length,0);
});
test("same request with a changed field or another actor conflicts without another posting",async()=>{
 const body=input();assert.equal((await recordStudentPayment(boundary(db),actor,body)).ok,true);
 for(const patch of[{amountPaisa:201},{invoiceId:otherInvoice},{method:"BANK"},{reference:"changed"},{reason:"Different verified reason"}])
  assert.equal((await recordStudentPayment(boundary(db),actor,{...body,...patch})).code,"CONFLICT");
 assert.equal((await recordStudentPayment(boundary(db),{profileId:operator,permissions:actor.permissions},body)).code,"CONFLICT");
 assert.equal(n("finance_payments"),1);
});
test("concurrent identical calls across two database connections recover the same receipt",async()=>{
 const db2=new DatabaseSync(path.join(folder,"ledger.sqlite"));files.push(db2);db2.exec("PRAGMA foreign_keys=ON");
 let arrived=0,release;const gate=new Promise(resolve=>release=resolve);
 const barrier=async()=>{if(++arrived===2)release();await gate;};
 const body=input();
 const [a,b]=await Promise.all([
  recordStudentPayment(boundary(db,{beforeWrite:barrier}),actor,body),
  recordStudentPayment(boundary(db2,{beforeWrite:barrier}),actor,body),
 ]);
 assert.equal(arrived,2);assert.equal(a.ok,true);assert.equal(b.ok,true);assert.equal(a.id,b.id);
 assert.equal(n("finance_payments"),1);assert.equal(n("finance_payment_commands"),1);
});
test("two different concurrent intended payments cannot over-allocate",async()=>{
 const body=input({amountPaisa:700});
 const [a,b]=await Promise.all([recordStudentPayment(boundary(db),actor,body),
  recordStudentPayment(boundary(db),actor,{...body,requestId:crypto.randomUUID()})]);
 assert.equal([a,b].filter(x=>x.ok).length,1);assert.equal(n("finance_payments"),1);
 assert.equal(db.prepare("SELECT paid_paisa FROM finance_invoices WHERE id=?").get(invoice).paid_paisa,700);
});
test("a lost write response is recovered before reporting failure",async()=>{
 const body=input();const a=await recordStudentPayment(boundary(db,{loseResponse:true}),actor,body);
 assert.equal(a.ok,true);assert.equal(a.replayed,true);
 assert.equal((await findStudentPaymentResult(boundary(db),actor,body.requestId)).id,a.id);
 assert.equal(n("finance_payments"),1);
});
test("every payment method posts the expected cash account and fixed receipt balance",async()=>{
 for(const method of["CASH","BANK","MFS"]){
  const a=await recordStudentPayment(boundary(db),actor,input({method}));assert.equal(a.ok,true);
  const expected={CASH:"sohoj-asset-cash",BANK:"sohoj-asset-bank",MFS:"sohoj-asset-mfs"}[method];
  const row=db.prepare("SELECT l.account_id FROM finance_journal_lines l JOIN finance_journals j ON j.id=l.journal_id WHERE j.reference LIKE ? AND l.debit_paisa>0")
   .get("PAY:"+a.receiptNo+":%");
  assert.equal(row.account_id,expected);
 }
});
test("missing ledger trigger or audit failure rolls the complete payment statement back",async()=>{
 for(const fail of["ledger","audit"]){
  if(fail==="ledger")db.exec("DROP TRIGGER post_payment_allocation_gl");
  else {
   // Restore the real allocation trigger for the independent audit-failure case.
   const sql=fs.readFileSync("migrations/history/0014_tuition_collections_and_double_entry.sql","utf8");
   db.exec(sql);
   db.exec("CREATE TRIGGER payment_test_audit_failure BEFORE INSERT ON erp_audit_events BEGIN SELECT RAISE(ABORT,'audit failure'); END");
  }
  const before=balances(),journals=n("finance_journals");
  const a=await recordStudentPayment(boundary(db),actor,input());
  assert.equal(a.ok,false);assert.deepEqual(balances(),before);
  assert.equal(n("finance_payments"),0);assert.equal(n("finance_allocations"),0);
  assert.equal(n("finance_payment_commands"),0);assert.equal(n("finance_journals"),journals);
 }
});
test("revocation between authorization and the write aborts all money changes",async()=>{
 const a=await recordStudentPayment(boundary(db,{beforeWrite:async()=>{
  db.prepare("DELETE FROM erp_permission_grants WHERE user_id=?").run(operator);
 }}),{profileId:operator,permissions:actor.permissions},input());
 assert.equal(a.ok,false);assert.equal(n("finance_payments"),0);assert.equal(n("finance_payment_commands"),0);
});
test("old admission receipt keys replay their original result and reject altered intent",async()=>{
 db.prepare("INSERT INTO academy_admissions(id,application_no,offering_id,student_id,status,prepared_by) VALUES (?,'APP-LEGACY','sa-ssc-science',?,'BILLED',?)").run(admission,student,owner);
 db.prepare("UPDATE finance_invoices SET admission_id=? WHERE id=?").run(admission,invoice);
 const request=crypto.randomUUID(),payment=crypto.randomUUID(),allocation=crypto.randomUUID();
 db.prepare("INSERT INTO finance_payments(id,receipt_no,student_id,amount_paisa,payment_method,received_by) VALUES (?,'RCPT-LEGACY',?,100,'CASH',?)").run(payment,student,owner);
 db.prepare("INSERT INTO finance_allocations(id,payment_id,invoice_id,amount_paisa) VALUES (?,?,?,100)").run(allocation,payment,invoice);
 db.prepare("INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason) VALUES (?,'finance_payment',?,'RECEIVED_AND_ALLOCATED',?,'Original admission payment')").run(crypto.randomUUID(),payment,owner);
 db.prepare("INSERT INTO academy_admission_collection_keys VALUES (?,?,?,?)").run(request,payment,admission,owner);
 const body={requestId:request,admissionId:admission,amountPaisa:100,method:"CASH",reference:"",reason:"Original admission payment"};
 const a=await recordStudentPayment(boundary(db),actor,body);
 assert.equal(a.ok,true);assert.equal(a.id,payment);assert.equal(a.receiptNo,"RCPT-LEGACY");
 assert.equal((await recordStudentPayment(boundary(db),actor,{...body,amountPaisa:200})).code,"CONFLICT");
 assert.equal(n("finance_payments"),1);assert.equal(n("finance_payment_commands"),0);
});
test("a later payment never changes the recorded outcome of an earlier request",async()=>{
 const body=input();const a=await recordStudentPayment(boundary(db),actor,body);
 await recordStudentPayment(boundary(db),actor,input());
 const replay=await recordStudentPayment(boundary(db),actor,body);
 assert.equal(replay.remainingDuePaisa,a.remainingDuePaisa);assert.equal(replay.remainingDuePaisa,800);
});
test("request results are actor-scoped and immutable",async()=>{
 const body=input();await recordStudentPayment(boundary(db),actor,body);
 assert.equal((await findStudentPaymentResult(boundary(db),{profileId:operator,permissions:actor.permissions},body.requestId)).code,"CONFLICT");
 assert.equal(await findStudentPaymentResult(boundary(db),actor,crypto.randomUUID()),null);
 assert.throws(()=>db.prepare("DELETE FROM finance_payment_commands WHERE request_id=?").run(body.requestId),/immutable/);
 assert.throws(()=>db.prepare("UPDATE finance_payment_commands SET amount_paisa=1 WHERE request_id=?").run(body.requestId),/immutable/);
});
