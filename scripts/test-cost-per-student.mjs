import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {costPerStudentSql,costPerActiveStudentPaisa} from "../lib/cost-per-student-sql.ts";

test("operating cost uses all month entries and DISTINCT active students rather than batch seats",()=>{
 const db=new DatabaseSync(":memory:");
 try{
  db.exec("CREATE TABLE academy_students(id TEXT PRIMARY KEY,status TEXT,merged_into_id TEXT);"+
   "CREATE TABLE academy_enrollments(id TEXT PRIMARY KEY,student_id TEXT,status TEXT);"+
   "CREATE TABLE finance_operating_expenses(id TEXT PRIMARY KEY,category TEXT,amount_paisa INTEGER,spent_on TEXT);");
  for(const [id,status,merged] of [
   ["s1","ACTIVE",null],["s2","ACTIVE",null],["s3","INACTIVE",null],["s4","ACTIVE","s1"]
  ])db.prepare("INSERT INTO academy_students VALUES(?,?,?)").run(id,status,merged);
  const enroll=db.prepare("INSERT INTO academy_enrollments VALUES(?,?,?)");
  enroll.run("e1","s1","ACTIVE");enroll.run("e2","s1","ACTIVE");
  enroll.run("e3","s2","ACTIVE");enroll.run("e4","s3","ACTIVE");
  enroll.run("e5","s4","ACTIVE");enroll.run("e6","s2","WITHDRAWN");
  const expense=db.prepare("INSERT INTO finance_operating_expenses VALUES(?,?,?,?)");
  for(let i=0;i<251;i++)expense.run("expense-"+i,i%2?"RENT":"UTILITIES",150,"2026-10-14");
  expense.run("prior","OTHER",9999,"2026-09-14");
  const count=db.prepare(costPerStudentSql.activeStudents).get().n;
  const costs=db.prepare(costPerStudentSql.operatingExpense).get("2026-10-01","2026-10-31");
  const categories=db.prepare(costPerStudentSql.expenseCategories).all("2026-10-01","2026-10-31");
  assert.equal(count,2);
  assert.equal(costs.entries,251);
  assert.equal(costs.paisa,37650);
  assert.equal(categories.reduce((sum,row)=>sum+row.paisa,0),37650);
  assert.equal(costPerActiveStudentPaisa(costs.paisa,count),18825);
  assert.doesNotMatch(costPerStudentSql.operatingExpense,/LIMIT/i);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
 }finally{db.close();}
});
test("empty or invalid denominator is never reported as zero-cost profitability",()=>{
 assert.equal(costPerActiveStudentPaisa(0,0),null);
 assert.equal(costPerActiveStudentPaisa(1001,3),334);
 assert.throws(()=>costPerActiveStudentPaisa(-1,3));
 assert.throws(()=>costPerActiveStudentPaisa(100,Number.NaN));
});
test("management page discloses exclusions and uses permission gate and canonical route",()=>{
 const page=readFileSync("app/dashboard/finance/cost-per-student/page.tsx","utf8");
 const routes=readFileSync("modules/platform/navigation/erp-route-registry.ts","utf8");
 assert.match(page,/requirePermission\("accounting.view"\)/);
 assert.match(page,/OWNER/);
 assert.match(page,/payroll, teaching compensation/);
 assert.match(page,/not a full monthly cost/);
 assert.match(page,/No active enrolled students/);
 assert.match(routes,/\/dashboard\/finance\/cost-per-student/);
 assert.doesNotMatch(page,/bg-white|text-slate-|bg-slate-/);
});
