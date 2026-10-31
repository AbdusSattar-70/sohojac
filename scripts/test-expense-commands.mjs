import assert from "node:assert/strict";
import {readFile,readdir,mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {stripTypeScriptTypes} from "node:module";
import {DatabaseSync} from "node:sqlite";
import {Worker} from "node:worker_threads";
import {beforeEach,after,test} from "node:test";
import {z} from "zod";

const root=new URL("../",import.meta.url);
const migrationNames=(await readdir(new URL("migrations/",root))).filter(name=>/^\d{4}_.*\.sql$/.test(name)).sort();
assert.deepEqual(migrationNames.slice(0,4),["0001_schema_tables.sql","0002_schema_indexes.sql","0003_domain_guards.sql","0004_finance_reference.sql"]);
const migrations=await Promise.all(migrationNames.map(name=>readFile(new URL("migrations/"+name,root),"utf8")));
function compile(source,bindings,exports){
  const executable=stripTypeScriptTypes(source,{mode:"strip"}).replace(/^import[^\n]*\n/gm,"")
    .replace(/\bexport (?=(?:async )?function|const)/g,"");
  return new Function(...Object.keys(bindings),executable+"\nreturn {"+exports.join(",")+"};")(...Object.values(bindings));
}
const {businessDate}=compile(await readFile(new URL("modules/platform/business-date.ts",root),"utf8"),{},["businessDate"]);
const {expenseInput}=compile(await readFile(new URL("lib/erp-expenses.ts",root),"utf8"),{z,businessDate},["expenseInput"]);
const {recordOperatingExpense,POST_OPERATING_EXPENSE_PERMISSION}=compile(
  await readFile(new URL("modules/finance/expenses/commands.ts",root),"utf8"),{expenseInput},
  ["recordOperatingExpense","POST_OPERATING_EXPENSE_PERMISSION"]);
const actorId="55555555-5555-4555-8555-555555555555",otherActorId="66666666-6666-4666-8666-666666666666";
const actor={profileId:actorId,permissions:["accounting.view",POST_OPERATING_EXPENSE_PERMISSION]};
let db,dbPath,directory,queryCount,failAfterCommit,beforeBatch,threadedBarrier;
const workerSource=`
  const {parentPort,workerData}=require('node:worker_threads');
  const {DatabaseSync}=require('node:sqlite');
  const db=new DatabaseSync(workerData.path);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000');
  const barrier=new Int32Array(workerData.barrier);
  Atomics.add(barrier,0,1);Atomics.notify(barrier,0);
  while(Atomics.load(barrier,0)<2)Atomics.wait(barrier,0,1,10000);
  try{
    db.exec('BEGIN IMMEDIATE');
    for(const s of workerData.statements)db.prepare(s.sql).run(...s.values);
    db.exec('COMMIT');parentPort.postMessage({ok:true});
  }catch(e){try{db.exec('ROLLBACK');}catch{}parentPort.postMessage({error:e.message});}
  finally{db.close();}
`;
function runWorker(statements){
  return new Promise((resolve,reject)=>{
    const worker=new Worker(workerSource,{eval:true,workerData:{path:dbPath,barrier:threadedBarrier,statements}});
    worker.once("message",result=>result.ok?resolve([]):reject(Error(result.error)));
    worker.once("error",reject);
    worker.once("exit",code=>{if(code)reject(Error("SQLite worker exited "+code));});
  });
}
const adapter={
  prepare(sql){
    let values=[];
    const statement={sql,get values(){return values;},bind(...args){values=args;return statement;},
      async first(){queryCount++;return db.prepare(sql).get(...values)??null;},
      async all(){queryCount++;return {results:db.prepare(sql).all(...values)};},
    };return statement;
  },
  async batch(statements){
    const hook=beforeBatch;beforeBatch=null;if(hook)await hook();
    queryCount++;
    if(threadedBarrier)return runWorker(statements.map(({sql,values})=>({sql,values})));
    db.exec("BEGIN IMMEDIATE");
    let results;
    try{
      results=statements.map(({sql,values})=>({results:db.prepare(sql).all(...values)}));
      db.exec("COMMIT");
    }catch(e){db.exec("ROLLBACK");throw e;}
    if(failAfterCommit){failAfterCommit=false;throw Error("Response lost after commit");}
    return results;
  },
};
function input(more={}){
  return {requestId:crypto.randomUUID(),category:"RENT",payee:"Synthetic supplier",
    description:"Synthetic monthly operating expense",spentOn:businessDate(),amountPaisa:120099,
    method:"CASH",reason:"Synthetic approved payment evidence",...more};
}
function evidence(){
  return ["finance_expense_command_keys","finance_operating_expenses","finance_journals","finance_journal_lines","erp_audit_events"]
    .map(table=>db.prepare("SELECT COUNT(*) n FROM "+table).get().n);
}
beforeEach(async()=>{
  db?.close();if(directory)await rm(directory,{recursive:true,force:true});
  directory=await mkdtemp(join(tmpdir(),"expense-command-"));dbPath=join(directory,"test.sqlite");
  db=new DatabaseSync(dbPath);db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000");
  for(const migration of migrations)db.exec(migration);
  for(const id of [actorId,otherActorId]){
    db.prepare('INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES(?,?,?,?,?,?)')
      .run(id,"Synthetic staff",id+"@example.invalid",1,0,0);
    db.prepare("INSERT INTO staff_memberships(user_id,role,active) VALUES(?,'ADMIN',1)").run(id);
    db.prepare("INSERT INTO erp_permission_grants(user_id,permission) VALUES(?,?)").run(id,POST_OPERATING_EXPENSE_PERMISSION);
  }
  queryCount=0;failAfterCommit=false;beforeBatch=null;threadedBarrier=null;
});
after(async()=>{db?.close();if(directory)await rm(directory,{recursive:true,force:true});});

test("authentication and exact named grant deny before any database access",async()=>{
  for(const attemptedActor of [null,{profileId:actorId,permissions:[],role:"OWNER"},
    {profileId:actorId,permissions:["finance.payments.post","accounting.view"]}]){
    const result=await recordOperatingExpense(adapter,attemptedActor,input());
    assert.equal(result.ok,false);assert([401,403].includes(result.status));
  }
  assert.equal(queryCount,0);assert.deepEqual(evidence(),[0,0,0,0,0]);
});
test("real schema rejects missing identities, fractional paisa, invalid dates and unknown payload fields",async()=>{
  const tomorrow=new Date();tomorrow.setUTCDate(tomorrow.getUTCDate()+2);
  for(const more of [{requestId:undefined},{requestId:"invalid"},{amountPaisa:0},{amountPaisa:1.5},
    {amountPaisa:200000001},{category:"UNKNOWN"},{method:"CARD"},{spentOn:"2026-02-30"},
    {spentOn:businessDate(tomorrow)},{reason:"short"},{actorId:otherActorId}]){
    const result=await recordOperatingExpense(adapter,actor,input(more));
    assert.equal(result.status,400,JSON.stringify(more));
  }
  assert.equal(queryCount,0);assert.deepEqual(evidence(),[0,0,0,0,0]);
});
test("business dates use Asia/Dhaka across the UTC day boundary",()=>{
  assert.equal(businessDate(new Date("2026-10-30T17:59:59.999Z")),"2026-10-30");
  assert.equal(businessDate(new Date("2026-10-30T18:00:00.000Z")),"2026-10-31");
});
test("every payment method posts exact integer amounts with the expected cash account and actor audit",async()=>{
  for(const [method,account] of [["CASH","sohoj-asset-cash"],["BANK","sohoj-asset-bank"],["MFS","sohoj-asset-mfs"]]){
    const value=input({method,amountPaisa:101});const result=await recordOperatingExpense(adapter,actor,value);
    assert.equal(result.ok,true);
    const journal=db.prepare("SELECT * FROM finance_journals WHERE reference=?").get("EXP:"+result.reference);
    assert.equal(journal.posted_by,actorId);assert.equal(journal.status,"POSTED");
    const lines=db.prepare("SELECT account_id,debit_paisa,credit_paisa FROM finance_journal_lines WHERE journal_id=? ORDER BY debit_paisa DESC").all(journal.id);
    assert.deepEqual(lines.map(x=>({...x})),[
      {account_id:"sohoj-expense-operating",debit_paisa:101,credit_paisa:0},
      {account_id:account,debit_paisa:0,credit_paisa:101},
    ]);
    const audit=db.prepare("SELECT * FROM erp_audit_events WHERE entity_id=?").get(result.id);
    assert.equal(audit.actor_id,actorId);assert.equal(audit.reason,value.reason);
    assert.equal(JSON.parse(audit.after_json).requestId,value.requestId);
  }
  assert.deepEqual(evidence(),[3,3,3,6,3]);
});
test("identical retries, including normalized text, return the original expense and reference",async()=>{
  const value=input(),first=await recordOperatingExpense(adapter,actor,value);
  const retry=await recordOperatingExpense(adapter,actor,{...value,payee:"  "+value.payee+"  "});
  assert.equal(first.ok,true);assert.equal(first.replayed,false);assert.equal(retry.replayed,true);
  assert.equal(retry.id,first.id);assert.equal(retry.reference,first.reference);
  assert.deepEqual(evidence(),[1,1,1,2,1]);
});
test("same key with altered business fields or another actor conflicts without leaking a reference",async()=>{
  const value=input();assert.equal((await recordOperatingExpense(adapter,actor,value)).ok,true);
  for(const more of [{category:"OTHER"},{payee:"Other supplier"},{description:"Other operating expense"},
    {spentOn:"2026-01-01"},{amountPaisa:1},{method:"BANK"},{reason:"Other approval evidence"}]){
    const result=await recordOperatingExpense(adapter,actor,{...value,...more});
    assert.equal(result.status,409);assert.equal(result.reference,undefined);
  }
  const other=await recordOperatingExpense(adapter,{...actor,profileId:otherActorId},value);
  assert.equal(other.status,409);assert.equal(other.reference,undefined);
  assert.deepEqual(evidence(),[1,1,1,2,1]);
});
test("a lost response after a successful commit is recovered before reporting failure",async()=>{
  const value=input();failAfterCommit=true;
  const first=await recordOperatingExpense(adapter,actor,value);
  assert.equal(first.ok,true);assert.equal(first.replayed,true);
  assert.equal((await recordOperatingExpense(adapter,actor,value)).id,first.id);
  assert.deepEqual(evidence(),[1,1,1,2,1]);
});
test("independent SQLite connections race identical production commands and return one expense",async()=>{
  const value=input();threadedBarrier=new SharedArrayBuffer(4);
  const [left,right]=await Promise.all([recordOperatingExpense(adapter,actor,value),recordOperatingExpense(adapter,actor,value)]);
  assert.equal(left.ok,true);assert.equal(right.ok,true);
  assert.equal(left.id,right.id);assert.equal(left.reference,right.reference);
  assert.deepEqual([left.replayed,right.replayed].sort(),[false,true]);
  assert.deepEqual(evidence(),[1,1,1,2,1]);
});
test("independent concurrent attempts cannot take a request owned by another payload or actor",async()=>{
  const value=input();threadedBarrier=new SharedArrayBuffer(4);
  const results=await Promise.all([
    recordOperatingExpense(adapter,actor,value),
    recordOperatingExpense(adapter,{...actor,profileId:otherActorId},{...value,amountPaisa:1}),
  ]);
  assert.equal(results.filter(x=>x.ok).length,1);
  assert.equal(results.filter(x=>x.status===409).length,1);
  assert.deepEqual(evidence(),[1,1,1,2,1]);
});
test("audit failure rolls back expense, request reservation and triggered journal, allowing safe retry",async()=>{
  db.exec("CREATE TRIGGER fail_expense_audit BEFORE INSERT ON erp_audit_events BEGIN SELECT RAISE(ABORT,'Injected audit outage'); END");
  const value=input();assert.equal((await recordOperatingExpense(adapter,actor,value)).ok,false);
  assert.deepEqual(evidence(),[0,0,0,0,0]);
  db.exec("DROP TRIGGER fail_expense_audit");assert.equal((await recordOperatingExpense(adapter,actor,value)).ok,true);
  assert.deepEqual(evidence(),[1,1,1,2,1]);
});
test("a missing or incorrect GL trigger prevents a partial expense from committing",async()=>{
  const original=db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='post_operating_expense_gl'").get().sql;
  db.exec("DROP TRIGGER post_operating_expense_gl");
  assert.equal((await recordOperatingExpense(adapter,actor,input())).ok,false);
  assert.deepEqual(evidence(),[0,0,0,0,0]);
  db.exec(original.replaceAll("'sohoj-asset-cash'","'sohoj-asset-bank'"));
  assert.equal((await recordOperatingExpense(adapter,actor,input())).ok,false);
  assert.deepEqual(evidence(),[0,0,0,0,0]);
});
test("grant or staff revocation between authentication and batch rolls back all posting effects",async()=>{
  for(const [revoke,restore] of [
    ["DELETE FROM erp_permission_grants",`INSERT INTO erp_permission_grants(user_id,permission) VALUES('${actorId}','${POST_OPERATING_EXPENSE_PERMISSION}')`],
    ["UPDATE staff_memberships SET active=0","UPDATE staff_memberships SET active=1"],
    ["UPDATE academy_staff SET status='TERMINATED'","UPDATE academy_staff SET status='ACTIVE'"],
  ]){
    beforeBatch=()=>db.exec(revoke);
    assert.equal((await recordOperatingExpense(adapter,actor,input())).ok,false);
    assert.deepEqual(evidence(),[0,0,0,0,0]);db.exec(restore);
  }
});
test("posted expense and its retry evidence are immutable",async()=>{
  const value=input();const result=await recordOperatingExpense(adapter,actor,value);assert.equal(result.ok,true);
  for(const sql of ["UPDATE finance_operating_expenses SET amount_paisa=1","DELETE FROM finance_operating_expenses",
    "UPDATE finance_expense_command_keys SET actor_id='changed'","DELETE FROM finance_expense_command_keys"]){
    assert.throws(()=>db.exec(sql),/immutable/);
  }
  assert.deepEqual(evidence(),[1,1,1,2,1]);
});
test("retry rechecks permission even when the original posting is already committed",async()=>{
  const value=input();assert.equal((await recordOperatingExpense(adapter,actor,value)).ok,true);
  const before=queryCount;
  assert.equal((await recordOperatingExpense(adapter,{...actor,permissions:[]},value)).status,403);
  assert.equal(queryCount,before);assert.deepEqual(evidence(),[1,1,1,2,1]);
});
test("REST adapter uses the canonical command and named grants, with stable request identity",async()=>{
  let access=actor,accessFailure=false;
  const route=compile(await readFile(new URL("app/api/staff/expenses/route.ts",root),"utf8"),{
    env:{DB:adapter},privateJson:(body,status=200)=>Response.json(body,{status}),
    sameOrigin:request=>request.headers.get("origin")==="https://erp.example.invalid",
    getCommandAccess:async()=>{if(accessFailure)throw Error("Grant database unavailable");return access;},POST_OPERATING_EXPENSE_PERMISSION,recordOperatingExpense,
  },["POST","GET"]);
  const value=input();
  const request=(body=value,origin="https://erp.example.invalid")=>new Request("https://erp.example.invalid/api/staff/expenses",{
    method:"POST",headers:{"Content-Type":"application/json",origin},body:JSON.stringify(body),
  });
  assert.equal((await route.POST(request())).status,201);
  const retry=await route.POST(request());assert.equal(retry.status,200);
  assert.equal((await retry.json()).replayed,true);
  assert.equal((await route.POST(request({...value,amountPaisa:1}))).status,409);
  assert.equal((await route.POST(request(value,"https://other.example.invalid"))).status,403);
  const headerValue=input();const {requestId:headerId,...headerBody}=headerValue;
  const withKey=(body,key)=>new Request("https://erp.example.invalid/api/staff/expenses",{
    method:"POST",headers:{"Content-Type":"application/json",origin:"https://erp.example.invalid","Idempotency-Key":key},body:JSON.stringify(body),
  });
  assert.equal((await route.POST(withKey(headerBody,headerId))).status,201);
  assert.equal((await route.POST(withKey(headerValue,crypto.randomUUID()))).status,400);
  access={...actor,permissions:["accounting.view"]};
  const readOnly=await route.GET(new Request("https://erp.example.invalid/api/staff/expenses"));
  assert.equal(readOnly.status,200);const readData=await readOnly.json();
  assert.equal(readData.canPost,false);assert.equal(readData.actorId,actorId);
  assert.equal((await route.POST(request(input()))).status,403);
  access={...actor,permissions:[],role:"ADMIN"};
  assert.equal((await route.POST(request())).status,403);
  assert.equal((await route.GET(new Request("https://erp.example.invalid/api/staff/expenses"))).status,403);
  access=null;assert.equal((await route.POST(request())).status,401);
  accessFailure=true;
  assert.equal((await route.GET(new Request("https://erp.example.invalid/api/staff/expenses"))).status,503);
  assert.equal((await route.POST(request())).status,503);
  assert.deepEqual(evidence(),[2,2,2,4,2]);
});
test("actual expense UI keeps actor-scoped pending requests across reloads, actor changes and ambiguous replies",async()=>{
  const source=await readFile(new URL("components/staff/expenses-register.tsx",root),"utf8");
  // Execute production hooks and submit logic; truncate only the JSX rendering.
  // No alternate implementation of the request lifecycle is used in this test.
  const logic=source.slice(0,source.indexOf("  return <div"))+"  return {submit,setForm,unconfirmed,form,refresh,actorId};\n}";
  const state=[],refs=[],effectDeps=[],memos=[];
  let stateIndex,refIndex,effectIndex,memoIndex,responseActor=actorId;
  const requests=[],storage=new Map();let effects=[];
  const hookBindings={businessDate,expenseInput,
    sessionStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    useState(initial){const index=stateIndex++;if(!(index in state))state[index]=typeof initial==="function"?initial():initial;
      return [state[index],next=>{state[index]=typeof next==="function"?next(state[index]):next;}];},
    useRef(initial){const index=refIndex++;return refs[index]??(refs[index]={current:initial});},
    useEffect(fn,deps){const index=effectIndex++,previous=effectDeps[index];
      if(!previous||deps.some((value,n)=>value!==previous[n])){effects.push(fn);effectDeps[index]=deps;}},
    useCallback(fn,deps){const index=memoIndex++,previous=memos[index];
      if(!previous||deps.some((value,n)=>value!==previous.deps[n]))memos[index]={fn,deps};
      return memos[index].fn;},
    fetch:async(url,options)=>{
      if(!options?.method)return Response.json({items:[],totals:[],canPost:true,actorId:responseActor});
      requests.push(JSON.parse(options.body));
      if(requests.length===1)throw Error("Network response lost");
      if(requests.length===2)return Response.json({error:"Outcome unconfirmed"},{status:503});
      if(requests.length===3)return Response.json({error:"Expense posting permission required"},{status:403});
      return Response.json({ok:true,reference:"SA-EXP-RECOVERED"});
    },
  };
  const {ExpensesRegister}=compile(logic,hookBindings,["ExpensesRegister"]);
  const render=()=>{stateIndex=0;refIndex=0;effectIndex=0;memoIndex=0;return ExpensesRegister();};
  const settle=async()=>{
    let ui=render();
    while(effects.length){const scheduled=effects;effects=[];for(const effect of scheduled)effect();
      await new Promise(resolve=>setImmediate(resolve));ui=render();}
    return ui;
  };
  let ui=await settle();assert.equal(ui.actorId,actorId);
  ui.setForm({category:"RENT",payee:"Synthetic supplier",description:"Synthetic expense",
    spentOn:businessDate(),amount:"10.99",method:"CASH",reason:"Synthetic payment evidence"});
  ui=render();await ui.submit({preventDefault(){}});ui=render();assert.equal(ui.unconfirmed,true);
  const firstPending=storage.get("sohojac.operating-expense.pending.v1:"+actorId);
  responseActor=otherActorId;await ui.refresh();ui=await settle();
  assert.equal(ui.actorId,otherActorId);assert.equal(ui.unconfirmed,false);assert.equal(ui.form.amount,"");
  assert.equal(storage.get("sohojac.operating-expense.pending.v1:"+actorId),firstPending);
  ui.setForm({...ui.form,category:"OTHER",payee:"Second supplier",description:"Second actor expense",
    amount:"22.00",reason:"Second actor payment evidence"});ui=render();
  await ui.submit({preventDefault(){}});ui=render();assert.equal(ui.unconfirmed,true);
  assert.notEqual(requests[1].requestId,requests[0].requestId);
  responseActor=actorId;await ui.refresh();ui=await settle();
  assert.equal(ui.unconfirmed,true);assert.equal(ui.form.amount,"10.99");
  // Reloading the component restores the same durable pending intention.
  state.length=0;refs.length=0;effectDeps.length=0;memos.length=0;effects=[];ui=await settle();
  assert.equal(ui.unconfirmed,true);assert.equal(ui.form.amount,"10.99");
  // Even a stale input event cannot alter the snapshotted ambiguous request.
  ui.setForm({...ui.form,amount:"99.99"});ui=render();
  await ui.submit({preventDefault(){}});ui=render();assert.equal(ui.unconfirmed,true);
  await ui.submit({preventDefault(){}});ui=render();assert.equal(ui.unconfirmed,false);
  assert.deepEqual(requests[2],requests[0]);assert.deepEqual(requests[3],requests[0]);
  ui.setForm({...ui.form,amount:"1.00"});ui=render();await ui.submit({preventDefault(){}});
  assert.notEqual(requests[4].requestId,requests[0].requestId);
  responseActor=otherActorId;await ui.refresh();ui=await settle();
  assert.equal(ui.unconfirmed,true);assert.equal(ui.form.amount,"22.00");
  await ui.submit({preventDefault(){}});assert.deepEqual(requests[5],requests[1]);
  assert.equal(storage.size,0);
  assert.equal(requests[0].amountPaisa,1099);
  assert(source.includes("<fieldset disabled={busy||unconfirmed}>"));
});
