import Link from "next/link";
import type {DailyWorkOverview} from "@/modules/dashboard/daily-work-queries";

export function DailyWorkPanel({work}:{work:DailyWorkOverview}){
 const date=new Date(work.today+"T12:00:00Z").toLocaleDateString("en-GB",{
  day:"numeric",month:"long",year:"numeric",timeZone:"UTC"
 });
 return (
  <section aria-labelledby="daily-work-title" className="space-y-4" data-daily-work>
   <div className="flex flex-wrap items-end justify-between gap-3">
    <div>
     <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
      Academy workday · {date} (Dhaka)
     </p>
     <h2 id="daily-work-title" className="mt-1 text-xl font-semibold">What needs attention</h2>
     <p className="mt-1 text-sm text-muted-foreground">
      Full-register counts, not the most recent 200 records. Only work allowed by your role appears.
     </p>
    </div>
    <Link href="/dashboard/help" className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm hover:bg-muted">
     How do I complete these tasks?
    </Link>
   </div>
   {work.queues.length?(
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
     {work.queues.map(item=>(
      <Link key={item.id} href={item.href}
        className="group flex min-h-36 flex-col justify-between rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={item.count+" "+item.label+". Open workspace"}>
       <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-semibold">{item.label}</span>
        <span className="rounded-lg bg-muted px-2 py-1 text-2xl font-semibold tabular-nums">{item.count}</span>
       </div>
       <p className="mt-3 text-xs leading-5 text-muted-foreground">{item.detail}</p>
       <span className="mt-3 text-sm font-medium text-primary group-hover:underline">
        {item.count===0?"View workspace":"Work on these"} →
       </span>
      </Link>
     ))}
    </div>
   ):(
    <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
     No daily work queues are assigned to your permissions. Open your role workspace or ask an administrator for access.
    </p>
   )}
  </section>
 );
}
