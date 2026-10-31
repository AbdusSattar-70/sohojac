import {env} from "cloudflare:workers";
import {can,type ErpContext} from "@/types/erp";
import {dailyWorkSql} from "@/lib/daily-work-sql";

export type DailyWorkQueue={
  id:"enquiries"|"followups"|"admissions"|"dues"|"sessions"|"capacity";
  label:string;
  detail:string;
  href:string;
  count:number;
};
export type DailyWorkOverview={today:string;queues:DailyWorkQueue[]};

async function count(sql:string,...args:string[]):Promise<number>{
 const stmt=env.DB.prepare(sql);
 const row=await (args.length?stmt.bind(...args):stmt).first<{n:number}>();
 if(!row||typeof row.n!=="number"||!Number.isSafeInteger(row.n))
   throw Error("Daily work count unavailable");
 return row.n;
}
export async function getDailyWorkOverview(context:ErpContext):Promise<DailyWorkOverview>{
 const date=await env.DB.prepare("SELECT date('now','+6 hours') AS today").first<{today:string}>();
 if(!date?.today)throw Error("Academy workday unavailable");
 const queues:DailyWorkQueue[]=[];
 const tasks:Promise<void>[]=[];
 const add=(enabled:boolean,query:string,id:DailyWorkQueue["id"],label:string,detail:string,href:string,...args:string[])=>{
  if(!enabled)return;
  tasks.push(count(query,...args).then(value=>{
   queues.push({id,label,detail,href,count:value});
  }));
 };
 const teacherOnly=context.roles.includes("TEACHER") &&
   !context.roles.includes("ADMIN") && !context.roles.includes("OWNER");
 add(can(context,"crm.prospects.view"),dailyWorkSql.enquiries,"enquiries",
   "New enquiries","New enquiries awaiting first contact","/dashboard/crm/prospects");
 add(can(context,"crm.prospects.view"),dailyWorkSql.followups,"followups",
   "Follow-ups due","Active follow-ups due by today","/dashboard/crm/prospects");
 add(can(context,"admissions.view"),dailyWorkSql.admissions,"admissions",
   "Admissions to complete","Draft, review, accepted or billed cases still in progress",
   "/dashboard/admissions?view=open#case-register");
 add(can(context,"finance.view"),dailyWorkSql.overdueInvoices,"dues",
   "Student dues","Issued or partially paid invoices due by today",
   "/dashboard/finance/receivables");
 add(can(context,"academics.view"),
   teacherOnly?dailyWorkSql.teacherSessionsToday:dailyWorkSql.sessionsToday,
   "sessions","Today's classes",
   teacherOnly?"Your assigned scheduled or held sessions today":"Scheduled or held sessions today",
   teacherOnly?"/dashboard/teacher":"/dashboard/academics/routine",
   ...(teacherOnly?[context.profileId,context.profileId]:[]));
 add(can(context,"academics.view")&&!teacherOnly,dailyWorkSql.nearCapacityBatches,"capacity",
   "Nearly full batches","Active batches with two or fewer seats remaining",
   "/dashboard/academics/batches");
 await Promise.all(tasks);
 const order=["enquiries","followups","admissions","dues","sessions","capacity"];
 queues.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));
 return {today:date.today,queues};
}
