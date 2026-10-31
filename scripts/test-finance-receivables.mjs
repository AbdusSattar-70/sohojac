import assert from "node:assert/strict";
import {readFile,readdir,access} from "node:fs/promises";
import {stripTypeScriptTypes} from "node:module";
import {DatabaseSync} from "node:sqlite";
import {beforeEach,after,test} from "node:test";

const root=new URL("../",import.meta.url);
const baseline=new URL("migrations/",root);
const names=(await readdir(baseline)).filter(name=>/^\d{4}_.*\.sql$/.test(name)).sort();
assert(names.length>=4,"All canonical development schema files are required.");
const migrations=await Promise.all(names.map(name=>readFile(new URL(name,baseline),"utf8")));
let db;
let permissions,profileId,beforeBatch,queries,revalidated;
const studentA="11111111-1111-4111-8111-111111111111";
const studentB="22222222-2222-4222-8222-222222222222";
const invoiceA="33333333-3333-4333-8333-333333333333";
const invoiceB="44444444-4444-4444-8444-444444444444";
const staffA="55555555-5555-4555-8555-555555555555";
const staffB="66666666-6666-4666-8666-666666666666";
const env={DB:{
 prepare(sql){
  let values=[];
  const statement={sql,get values(){return values;},
   bind(...input){values=input;return statement;},
   async first(){queries.push(sql);return db.prepare(sql).get(...values)??null;},
   async all(){queries.push(sql);return {results:db.prepare(sql).all(...values)};}
  };return statement;
 },
 async batch(statements){
  const hook=beforeBatch;beforeBatch=null;if(hook)await hook();
  db.exec("BEGIN");
  try{
   const result=statements.map(({sql,values})=>{
    queries.push(sql);
    const results=db.prepare(sql).all(...values);
    return {results,meta:{changes:db.prepare("SELECT changes() n").get().n}};
   });
   db.exec("COMMIT");return result;
  }catch(error){db.exec("ROLLBACK");throw error;}
 }
}};
// Only external runtime boundaries are injected. Query/action SQL and mapping
// execute from the actual production modules against all 28 applied migrations.
const schema=new Proxy(()=>schema,{get(_,key){
 if(key==="safeParse")return data=>({success:true,data});
 return schema;
}});
async function context(){return {profileId,permissions};}
async function requirePermission(permission){
 if(!permissions.includes(permission))throw Error("Permission denied");
 return context();
}
async function load(path,exports){
 const source=await readFile(new URL(path,root),"utf8");
 const executable=stripTypeScriptTypes(source,{mode:"strip"})
  .replace(/^import .*;\r?\n/gm,"").replace(/\bexport (?=async function)/g,"");
 return new Function("env","z","revalidatePath","getErpContext","requirePermission",
  executable+"\nreturn {"+exports.join(",")+"};")(env,schema,p=>revalidated.push(p),context,requirePermission);
}
const {collectionFollowup}=await load("modules/finance/receivables/actions.ts",["collectionFollowup"]);
const {getReceivables}=await load("modules/finance/receivables/queries.ts",["getReceivables"]);
function date(offset=0){return db.prepare("SELECT date('now','+6 hours',?) day").get((offset>=0?"+":"")+offset+" days").day;}
function addInvoice(id,studentId,amount=100000,due=date(),status="ISSUED"){
 db.prepare("INSERT INTO finance_invoices(id,invoice_no,student_id,issue_on,due_on,amount_paisa,status,created_by) VALUES(?,?,?,date('now'),?,?,?,?)")
  .run(id,"INV-"+id,studentId,due,amount,status,staffA);
}
function pay(invoiceId,amount){
 const studentId=db.prepare("SELECT student_id FROM finance_invoices WHERE id=?").get(invoiceId).student_id;
 const id=crypto.randomUUID();
 db.prepare("INSERT INTO finance_payments(id,receipt_no,student_id,amount_paisa,payment_method,received_by) VALUES(?,?,?,?,?,?)")
  .run(id,"RCPT-"+id,studentId,amount,"CASH",staffA);
 db.prepare("INSERT INTO finance_allocations(id,payment_id,invoice_id,amount_paisa) VALUES(?,?,?,?)")
  .run(crypto.randomUUID(),id,invoiceId,amount);
}
function input(action="PROMISE",more={}){
 return {action,request_id:crypto.randomUUID(),invoice_id:invoiceA,reason:"Verified guardian contact outcome",
  ...(action==="PROMISE"?{amount:100,due_on:date()}:{}),...more};
}
function count(table){return db.prepare("SELECT COUNT(*) n FROM "+table).get().n;}
function financial(){
 return {
  invoices:db.prepare("SELECT id,amount_paisa,paid_paisa,status FROM finance_invoices ORDER BY id").all(),
  payments:db.prepare("SELECT * FROM finance_payments ORDER BY id").all(),
  allocations:db.prepare("SELECT * FROM finance_allocations ORDER BY id").all(),
  journals:db.prepare("SELECT * FROM finance_journals ORDER BY id").all(),
  lines:db.prepare("SELECT * FROM finance_journal_lines ORDER BY id").all()
 };
}
function evidence(){return ["finance_collection_promises","finance_collection_events","finance_collection_command_keys","erp_audit_events"].map(count);}
beforeEach(()=>{
 if(db)db.close();db=new DatabaseSync(":memory:");db.exec("PRAGMA foreign_keys=ON");
 for(const sql of migrations)db.exec(sql);
 for(const [id,name] of [[staffA,"Staff Alpha"],[staffB,"Staff Beta"]])
  db.prepare('INSERT INTO "user"(id,name,email,"createdAt","updatedAt") VALUES(?,?,?,?,?)').run(id,name,id+"@example.invalid",0,0);
 for(const [id,name,mobile] of [[studentA,"Student Alpha","01700000001"],[studentB,"Student Beta","01700000002"]])
  db.prepare("INSERT INTO academy_students(id,student_no,full_name,guardian_name,guardian_mobile,status) VALUES(?,?,?,?,?,'ACTIVE')")
   .run(id,id===studentA?"SA-000001":"SA-000002",name,"Guardian "+name,mobile);
 addInvoice(invoiceA,studentA);addInvoice(invoiceB,studentB,88888);
 permissions=["finance.view","finance.payments.post"];profileId=staffA;beforeBatch=null;queries=[];revalidated=[];
});
after(()=>db?.close());

test("finance view and collection grants are independently enforced before domain reads",async()=>{
 permissions=[];await assert.rejects(getReceivables(),/Permission denied/);
 assert.equal((await collectionFollowup(input())).ok,false);assert.equal(queries.length,0);
 permissions=["finance.view"];const data=await getReceivables();assert.equal(data.canManage,false);
 const before=queries.length;assert.equal((await collectionFollowup(input())).ok,false);assert.equal(queries.length,before);
});
test("source aging bands and missing due dates use Bangladesh day without inventing overdue dates",async()=>{
 const cases=[[-1,"1_30"],[-30,"1_30"],[-31,"31_60"],[-60,"31_60"],[-61,"61_90"],[-90,"61_90"],[-91,"90_PLUS"],[1,"NOT_DUE"],[null,"NOT_DUE"]];
 for(const [offset,bucket] of cases){
  const id=crypto.randomUUID();addInvoice(id,studentA,101,offset===null?null:date(offset));
  const row=(await getReceivables(1,id)).rows[0];assert.equal(row.id,id);assert.equal(row.bucket,bucket);
  assert.equal(row.age_days,offset===null?0:Math.max(-offset,0));
 }
 assert.equal((await getReceivables()).today,date());
});
test("search, aging and promise filters affect rows while summary covers all receivables",async()=>{
 addInvoice(crypto.randomUUID(),studentA,10001,date(-40));
 const data=await getReceivables(1,"SA-000001","31_60");
 assert.equal(data.total,1);assert.equal(data.rows[0].due,100.01);
 assert.equal(data.summary.reduce((n,r)=>n+Math.round(r.amount*100),0),198889);
 assert.equal((await getReceivables(1,"01700000002")).total,1);
 assert.equal((await getReceivables(1,"%", "ALL")).total,0,"Search wildcards are literal");
});
test("pagination is bounded and guardian statement scope never includes another student's balance",async()=>{
 for(let n=0;n<30;n++)addInvoice(crypto.randomUUID(),studentA,100);
 const first=await getReceivables(1,"","ALL",false,studentA);
 const second=await getReceivables(2,"","ALL",false,studentA);
 assert.equal(first.total,31);assert.equal(first.rows.length,25);assert.equal(second.rows.length,6);
 assert(first.rows.concat(second.rows).every(row=>row.student_id===studentA));
 assert.equal(first.summary.reduce((n,row)=>n+Math.round(row.amount*100),0),103000);
 for(const page of [0,10001,1.5])await assert.rejects(getReceivables(page),/Invalid/);
});
test("posted invoices only: draft and void are excluded, settled invoices remain in guardian history",async()=>{
 const draft=crypto.randomUUID(),voided=crypto.randomUUID();
 addInvoice(draft,studentA,50000,date(),"DRAFT");addInvoice(voided,studentA,50000,date(),"VOID");
 pay(invoiceA,100000);
 const register=await getReceivables();assert.equal(register.total,1);assert.equal(register.rows[0].id,invoiceB);
 const statement=await getReceivables(1,"","ALL",false,studentA);
 assert.equal(statement.total,1);assert.equal(statement.rows[0].paid,1000);assert.equal(statement.rows[0].due,0);
 assert.equal(statement.summary.length,0);
});
test("contact and promise capture evidence and audit without changing any financial ledger",async()=>{
 const before=financial();
 assert.equal((await collectionFollowup(input("CONTACT"))).ok,true);
 const result=await collectionFollowup(input());assert.equal(result.ok,true);
 assert.deepEqual(evidence(),[1,2,2,2]);assert.deepEqual(financial(),before);
 const row=(await getReceivables(1,"","ALL",true)).rows[0];
 assert.equal(row.id,invoiceA);assert.equal(row.promise_amount,100);assert.equal(row.promise_collected,0);
 assert(row.last_contact);assert(revalidated.includes("/dashboard/finance/receivables"));
});
test("exact retries recover their result, altered payloads and actors cannot reuse a request",async()=>{
 const v=input(),first=await collectionFollowup(v);
 assert.equal(first.ok,true);assert.deepEqual(await collectionFollowup(v),first);
 assert.equal((await collectionFollowup({...v,amount:101})).ok,false);
 profileId=staffB;assert.equal((await collectionFollowup(v)).ok,false);
 assert.deepEqual(evidence(),[1,1,1,1]);
});
test("invalid promise amount, precision, past date and overcommitment leave no partial evidence",async()=>{
 for(const more of [{amount:0.001},{amount:1000.01},{due_on:date(-1)},{amount:0}]){
  assert.equal((await collectionFollowup(input("PROMISE",more))).ok,false);
  assert.deepEqual(evidence(),[0,0,0,0]);
 }
});
test("one open promise is enforced and a concurrent retry recovers the committed request",async()=>{
 const v=input();beforeBatch=()=>collectionFollowup(v);
 assert.equal((await collectionFollowup(v)).ok,true);
 assert.equal((await collectionFollowup(input())).ok,false);
 assert.deepEqual(evidence(),[1,1,1,1]);
});
test("promise completion requires actual new payment allocations, not an invoice cache change",async()=>{
 const {id}=await collectionFollowup(input());
 const complete=()=>collectionFollowup(input("COMPLETE",{id,revision:1}));
 assert.equal((await complete()).ok,false);
 db.prepare("UPDATE finance_invoices SET paid_paisa=amount_paisa,status='PAID' WHERE id=?").run(invoiceA);
 assert.equal((await complete()).ok,false);
 assert.deepEqual(evidence(),[1,1,1,1]);
});
test("actual collections fulfill a promise, optimistic revision rejects duplicate closure",async()=>{
 const {id}=await collectionFollowup(input());pay(invoiceA,10000);
 const row=(await getReceivables(1,"SA-000001")).rows[0];assert.equal(row.promise_collected,100);
 const money=financial();
 assert.equal((await collectionFollowup(input("COMPLETE",{id,revision:1}))).ok,true);
 assert.equal((await collectionFollowup(input("CANCEL",{id,revision:1}))).ok,false);
 assert.deepEqual(financial(),money);assert.deepEqual(evidence(),[1,2,2,2]);
 assert.equal(db.prepare("SELECT revision,status FROM finance_collection_promises").get().status,"COMPLETED");
});
test("payments committed before promise capture become baseline and cannot satisfy the new promise",async()=>{
 beforeBatch=()=>pay(invoiceA,10000);
 const {id}=await collectionFollowup(input());
 assert.equal(db.prepare("SELECT baseline_paid_paisa n FROM finance_collection_promises").get().n,10000);
 assert.equal((await collectionFollowup(input("COMPLETE",{id,revision:1}))).ok,false);
 pay(invoiceA,10000);assert.equal((await collectionFollowup(input("COMPLETE",{id,revision:1}))).ok,true);
});
test("a competing payment can invalidate a promise atomically before its first write",async()=>{
 beforeBatch=()=>pay(invoiceA,95000);
 assert.equal((await collectionFollowup(input())).ok,false);
 assert.deepEqual(evidence(),[0,0,0,0]);
});
test("cancel preserves evidence and allows a fresh commitment with a fresh collection baseline",async()=>{
 const {id}=await collectionFollowup(input());
 assert.equal((await collectionFollowup(input("CANCEL",{id,revision:1}))).ok,true);
 assert.equal((await collectionFollowup(input("CANCEL",{id,revision:1}))).ok,false);
 assert.equal((await collectionFollowup(input())).ok,true);assert.equal(count("finance_collection_promises"),2);
 assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
});
test("promise identity is tied to its invoice and missing invoices never create evidence",async()=>{
 const {id}=await collectionFollowup(input());const before=financial();
 assert.equal((await collectionFollowup(input("CANCEL",{id,revision:1,invoice_id:invoiceB}))).ok,false);
 assert.equal((await collectionFollowup(input("CONTACT",{invoice_id:crypto.randomUUID()}))).ok,false);
 assert.equal((await collectionFollowup(input("PROMISE",{invoice_id:crypto.randomUUID()}))).ok,false);
 assert.deepEqual(evidence(),[1,1,1,1]);assert.deepEqual(financial(),before);
});
test("an audit failure rolls back promises, events and request keys together",async()=>{
 db.exec("CREATE TRIGGER reject_followup_audit BEFORE INSERT ON erp_audit_events WHEN NEW.entity_type='collection_followup' BEGIN SELECT RAISE(ABORT,'test ledger failure'); END");
 assert.equal((await collectionFollowup(input())).ok,false);assert.deepEqual(evidence(),[0,0,0,0]);
});
test("promise identity and captured evidence cannot be edited or permanently deleted",async()=>{
 const {id}=await collectionFollowup(input());
 for(const sql of [
  "DELETE FROM finance_collection_promises",
  "UPDATE finance_collection_promises SET amount_paisa=1",
  "UPDATE finance_collection_events SET reason='altered'",
  "DELETE FROM finance_collection_events",
  "UPDATE finance_collection_command_keys SET result_json='{}'",
  "DELETE FROM finance_collection_command_keys"
 ])assert.throws(()=>db.exec(sql));
 assert.equal((await collectionFollowup(input("CANCEL",{id,revision:1}))).ok,true);
 assert.throws(()=>db.exec("UPDATE finance_collection_promises SET status='OPEN',revision=revision+1"));
});
