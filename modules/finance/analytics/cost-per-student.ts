import {env} from "cloudflare:workers";
import {costPerStudentSql,costPerActiveStudentPaisa} from "@/lib/cost-per-student-sql";

type CountRow={n:number};
type ExpensesRow={entries:number;paisa:number};
export type ExpenseCategory={category:string;entries:number;paisa:number};
export type CostPerStudentSummary={
 today:string;start:string;activeStudents:number;entries:number;
 recordedOperatingPaisa:number;perStudentPaisa:number|null;
 categories:ExpenseCategory[];
};
/** Month-to-date recorded operating expenses divided by today's DISTINCT active students.
 * Neither the denominator nor the numerator claims historic or complete allocation.
 */
export async function getCurrentOperatingCostPerStudent():Promise<CostPerStudentSummary>{
 const date=await env.DB.prepare("SELECT date('now','+6 hours') AS day").first<{day:string}>();
 const today=date?.day;
 if(!today||!/^\d{4}-\d{2}-\d{2}$/.test(today))
  throw Error("Cannot establish academy-local reporting date");
 const start=today.slice(0,7)+"-01";
 const [count,expenses,categories]=await Promise.all([
  env.DB.prepare(costPerStudentSql.activeStudents).first<CountRow>(),
  env.DB.prepare(costPerStudentSql.operatingExpense).bind(start,today).first<ExpensesRow>(),
  env.DB.prepare(costPerStudentSql.expenseCategories).bind(start,today).all<ExpenseCategory>(),
 ]);
 if(!count||!expenses||!Number.isSafeInteger(count.n)||!Number.isSafeInteger(expenses.paisa)||
   !Number.isSafeInteger(expenses.entries))throw Error("Operating cost data unavailable");
 return {today,start,activeStudents:count.n,entries:expenses.entries,
  recordedOperatingPaisa:expenses.paisa,
  perStudentPaisa:costPerActiveStudentPaisa(expenses.paisa,count.n),
  categories:categories.results??[]};
}
