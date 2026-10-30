/** Source: sohoj-academy@f46b6161, student profile page (3b64914b).
 * Preserves the original read sections while D1 lifecycle commands are ported.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PageHeader } from "@/components/erp/page-header";
import { StatusBadge } from "@/components/erp/status-badge";
import { requirePermission } from "@/modules/platform/auth/erp-context";
import { getStudentProfile } from "@/modules/students/lifecycle/queries";
const money = (n: number) => `BDT ${n.toFixed(2)}`;
const when = (s: string) =>
  new Date(s).toLocaleString("en-GB", { timeZone: "Asia/Dhaka" });
export default async function StudentProfilePage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const context = await requirePermission("students.view");
  const { studentId } = await params;
  if (!z.string().uuid().safeParse(studentId).success) notFound();
  const data = await getStudentProfile(studentId);
  if (!data) notFound();
  const s = data.student;
  const can = (p: string) => context.permissions.includes(p);
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Student Record"
        title={`${s.number} · ${s.name}`}
        description="Permanent identity, guardian contacts and enrollment history."
      />
      <div className="flex flex-wrap gap-4 text-sm">
        <Link className="underline" href="/dashboard/students">
          Student register
        </Link>
        {can("admissions.view") && (
          <Link className="underline" href="/dashboard/admissions">
            Admissions
          </Link>
        )}
        {can("finance.view") && (
          <Link className="underline" href="/dashboard/finance/billing">
            Billing & Adjustments
          </Link>
        )}
        <StatusBadge value={s.status} />
      </div>
      <section className="rounded-2xl border bg-card p-5">
        <h2 className="font-semibold">Student Identity</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          {[
            ["Name", s.name],
            ["School", s.school ?? "Not recorded"],
            ["Created", when(s.createdAt)],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-sm font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section>
        <h2 className="mb-3 font-semibold">Guardian Contacts</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {[data.guardian].map((g) => (
            <article key={s.id} className="rounded-xl border bg-card p-4">
              <h3 className="font-medium">
                {g.name}{" "}
              </h3>
              <p className="mt-1 text-sm">
                Guardian · {g.mobile}
              </p>
            </article>
          ))}
        </div>
      </section>
      {data.admissionsVisible && <section className="space-y-3">
        <h2 className="font-semibold">Admission Cases</h2>
        {data.admissions.map((a) => (
          <article
            key={a.id}
            className="space-y-3 rounded-xl border bg-card p-4"
          >
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                {can("admissions.view") ? (
                  <Link
                    className="font-semibold underline"
                    href={`/dashboard/admissions/${a.id}`}
                  >
                    {a.number}
                  </Link>
                ) : (
                  <p className="font-semibold">{a.number}</p>
                )}
                <p className="mt-1 text-sm text-muted-foreground">
                  {a.offering} · {a.batch ?? "No batch recorded"} · {when(a.createdAt)}
                </p>
              </div>
              <StatusBadge value={a.status} />
            </div>
          </article>
        ))}
        {!data.admissions.length && (
          <p className="text-sm text-muted-foreground">
            No admission history recorded.
          </p>
        )}
      </section>}
      <section className="rounded-2xl border bg-card p-5">
        <h2 className="font-semibold">Enrollment History</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2">Academic year</th>
                <th>Class / Batch</th>
                <th>Start</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.enrollments.map((e) => (
                <tr key={e.id} className="border-b">
                  <td className="py-3">{e.year}</td>
                  <td>
                    {e.class} · {e.batch ?? "—"}
                  </td>
                  <td>{when(e.startsOn)}</td>
                  <td>
                    <StatusBadge value={e.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.enrollments.length && (
          <p className="mt-3 text-sm text-muted-foreground">
            No enrollment has been activated.
          </p>
        )}
      </section>
      {data.financeVisible && data.financeTotals && (
        <section className="space-y-3 rounded-2xl border bg-card p-5">
          <h2 className="font-semibold">Financial History</h2>
          <p className="text-sm">
            Outstanding: <strong>{money(data.financeTotals.due)}</strong>.
            Balances remain separate per invoice.
          </p>
          <p className="text-sm text-muted-foreground">
            Showing {data.invoices.length} of {data.financeInvoiceCount} posted invoices.
            Outstanding covers all posted invoices.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2">Invoice / Issued</th>
                  <th>Gross</th>
                  <th>Paid</th>
                  <th>Due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((i) => (
                  <tr key={i.id} className="border-b">
                    <td className="py-3">
                      <span className="font-medium">{i.number}</span>
                      <span className="block text-xs text-muted-foreground">
                        {i.issueOn}{i.dueOn ? ` · Due ${i.dueOn}` : ""}
                      </span>
                    </td>
                    {[i.gross, i.paid, i.due].map(
                      (amount, n) => (
                        <td key={n}>{amount.toFixed(2)}</td>
                      ),
                    )}
                    <td><StatusBadge value={i.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.invoices.length && (
            <p className="text-sm text-muted-foreground">No posted invoices.</p>
          )}
        </section>
      )}
    </div>
  );
}
