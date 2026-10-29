import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "cloudflare:workers";
import {
  ArrowRight, ArrowUpRight, CheckCircle2, Clock3, LayoutDashboard,
  Search, UserRoundSearch, UsersRound,
  type LucideIcon,
} from "lucide-react";
import { getStaffAccessForPage, canManageProspects } from "@/lib/staff-access";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, title: "Digital Campus" };

type EnquiryStatus = "NEW" | "CONTACTED" | "CLOSED";
type Recent = {
  reference: string; student_name: string; class_name: string;
  status: EnquiryStatus; submitted_at: string;
};

const statusNames: Record<EnquiryStatus, string> = {
  NEW: "New", CONTACTED: "Contacted", CLOSED: "Closed",
};

function StatCard({ title, value, description, icon: Icon, href }: {
  title: string; value: number | string; description: string; icon: LucideIcon; href?: string;
}) {
  const contents = <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">{value}</p>
        <p className="mt-2 text-xs leading-5 text-slate-500">{description}</p>
      </div>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
        <Icon size={20} aria-hidden="true"/>
      </span>
    </div>
  </div>;
  return href ? <Link href={href} className="block rounded-2xl outline-offset-2 hover:ring-2 hover:ring-blue-200 focus-visible:outline-2 focus-visible:outline-blue-600">{contents}</Link> : contents;
}

export default async function StaffHome() {
  const staff = await getStaffAccessForPage(await headers());
  if (!staff) redirect("/sign-in");
  const canRead = canManageProspects(staff);

  let totals: Record<EnquiryStatus, number> | null = null;
  let recent: Recent[] = [];
  if (canRead) {
    try {
      const [counts, latest] = await Promise.all([
        env.DB.prepare("SELECT status, COUNT(*) AS total FROM public_enquiries GROUP BY status")
          .all<{ status: EnquiryStatus; total: number }>(),
        env.DB.prepare(`SELECT reference, student_name, class_name, status, submitted_at
          FROM public_enquiries ORDER BY submitted_at DESC, id DESC LIMIT 6`).all<Recent>(),
      ]);
      totals = { NEW: 0, CONTACTED: 0, CLOSED: 0 };
      for (const entry of counts.results ?? []) {
        if (entry.status in totals) totals[entry.status] = Number(entry.total);
      }
      recent = latest.results ?? [];
    } catch {
      // Keep the ERP usable without presenting fabricated zero counts.
      totals = null;
      recent = [];
    }
  }

  const overall = totals ? totals.NEW + totals.CONTACTED + totals.CLOSED : "—";
  const number = (status: EnquiryStatus) => totals ? totals[status] : "—";

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.17em] text-blue-700">Operational overview</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Digital Campus</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Welcome, {staff.name}. Your daily operational workspace for Sohoj Academy.
            {canRead ? " Live figures come from public interest registrations." : " Your role currently has limited access."}
          </p>
        </div>
        {canRead && <Link href="/app/prospects"
          className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
          Review enquiries <ArrowRight size={16} aria-hidden="true"/>
        </Link>}
      </div>

      {canRead ? <>
        <section aria-label="Enquiry summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Total enquiries" value={overall} icon={UsersRound} description="All public interest registrations" href="/app/prospects"/>
          <StatCard title="New requests" value={number("NEW")} icon={UserRoundSearch} description="Awaiting first follow-up" href="/app/prospects?status=NEW"/>
          <StatCard title="Contacted" value={number("CONTACTED")} icon={Clock3} description="Reached by an authorized operator" href="/app/prospects?status=CONTACTED"/>
          <StatCard title="Closed" value={number("CLOSED")} icon={CheckCircle2} description="Follow-up completed" href="/app/prospects?status=CLOSED"/>
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,1fr)]">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Recent enquiries</h2>
                <p className="mt-1 text-xs text-slate-500">Latest registrations from the public website</p>
              </div>
              <Link href="/app/prospects" className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline">
                View all <ArrowUpRight size={14}/>
              </Link>
            </div>
            {totals === null ? <p className="p-6 text-sm text-amber-700">Enquiry data is temporarily unavailable.</p> :
              recent.length ? <div className="divide-y divide-slate-100">
                {recent.map(item => <div key={item.reference} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{item.student_name}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.reference} · {item.class_name} · {new Date(item.submitted_at).toLocaleDateString("en-BD", {timeZone: "Asia/Dhaka"})}</p>
                  </div>
                  <span className={"rounded-full px-2.5 py-1 text-[11px] font-semibold " + (
                    item.status === "NEW" ? "bg-amber-50 text-amber-800" :
                    item.status === "CONTACTED" ? "bg-blue-50 text-blue-800" : "bg-slate-100 text-slate-700")}>
                    {statusNames[item.status] ?? item.status}
                  </span>
                </div>)}
              </div> : <p className="p-6 text-sm text-slate-500">No enquiries have been received yet.</p>}
          </section>

          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><LayoutDashboard size={20}/></span>
              <h2 className="mt-4 text-base font-bold text-slate-900">Action center</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {totals ? totals.NEW > 0
                  ? `There are ${totals.NEW} new enquiries awaiting review.`
                  : "No new requests are awaiting first follow-up."
                  : "Check the enquiry register for follow-up work."}
              </p>
              <Link href="/app/prospects?status=NEW"
                className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-blue-700 hover:underline">
                Open new requests <ArrowRight size={15}/>
              </Link>
            </section>
            <section className="rounded-2xl border border-blue-100 bg-blue-50/70 p-5">
              <h2 className="text-sm font-bold text-blue-950">Admissions remain separate</h2>
              <p className="mt-2 text-xs leading-5 text-blue-900/80">
                An interest registration is not an admission, invoice or reserved seat.
                Formal admissions and fee management will be added as separate verified workflows.
              </p>
            </section>
          </div>
        </div>
      </> : <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <h2 className="text-base font-bold">Your staff workspace is ready</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Your role is {staff.role}. Access to guardian contact details and prospect updates is limited to authorized operations staff.
        </p>
      </div>}
    </div>
  );
}
