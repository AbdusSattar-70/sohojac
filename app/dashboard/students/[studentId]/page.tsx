/** Source: sohoj-academy@f46b6161, student profile page (3b64914b).
 * Source lifecycle forms use canonical D1 identities and retained histories.
 */
import { CloseEnrollmentForm } from "@/modules/students/lifecycle/close-enrollment-form";
import { StudentForm } from "@/modules/students/lifecycle/command-form";
import { RecordStateButton } from "@/components/erp/record-state-button";
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
  const canonical = s.id === s.canonicalId;
  const usable = canonical && s.status !== "ARCHIVED";
  const options = data.batches.map((batch) => ({
    id: batch.id,
    name: `${batch.name} · ${batch.year} · ${batch.class} · ${batch.offering} · ${batch.occupied}/${batch.capacity} seats`,
  }));
  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Student Record"
        title={`${s.number} · ${s.name}`}
        description="Permanent identity, guardian contacts, enrollment history and controlled lifecycle actions."
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
        {can("students.manage") && canonical && (
          <RecordStateButton entity="student" id={s.id} active={s.status === "ACTIVE"} />
        )}
      </div>
      {!canonical && (
        <p className="rounded-xl border bg-muted/40 p-5 text-sm">
          This duplicate identity was archived after authorized identity verification. Use{" "}
          <Link className="font-semibold underline" href={`/dashboard/students/${s.canonicalId}`}>
            {s.canonicalNumber}
          </Link>{" "}
          for new work. Original records remain under their original IDs; the history below includes the linked identities.
        </p>
      )}
      <section className="rounded-2xl border bg-card p-5">
        <h2 className="font-semibold">Student Identity</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          {[
            ["Name", s.name],
            ["School", s.school ?? "Not recorded"],
            ["Created", when(s.createdAt)],
            ["Canonical Student ID", s.canonicalNumber],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 text-sm font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        {data.identities.length > 1 && (
          <p className="mt-4 text-sm">
            Linked historical identities:{" "}
            {data.identities.map((identity) => (
              <Link key={identity.id} className="mr-3 underline" href={`/dashboard/students/${identity.id}`}>
                {identity.number}
              </Link>
            ))}
          </p>
        )}
      </section>
      <section>
        <h2 className="mb-3 font-semibold">Guardian Contacts</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {data.guardianContacts.map((g) => (
            <article key={g.studentId} className="rounded-xl border bg-card p-4">
              <h3 className="font-medium">
                {g.name} <span className="text-xs text-muted-foreground">· {g.studentNumber}</span>
              </h3>
              <p className="mt-1 text-sm">
                Guardian · {g.mobile}
              </p>
            </article>
          ))}
        </div>
      </section>
      {usable && can("admissions.create") && (
        <details className="rounded-2xl border p-5">
          <summary className="cursor-pointer font-semibold">Enroll This Existing Student</summary>
          <div className="mt-4">
            <StudentForm
              defaults={{ action: "CREATE_EXISTING", student_id: s.id }}
              fields={[{
                key: "batch_id", label: "Programme / Batch",
                options: options.filter((option) => {
                  const batch = data.batches.find((row) => row.id === option.id)!;
                  return batch.occupied < batch.capacity;
                }),
                hint: "Choose placement for this enrollment. Only batches with available capacity are listed; seats are checked again at activation.",
              }]}
              label="Create Enrollment Draft"
              description="Keeps this Student ID and guardian. The selected Fee Plan, including its one-time charges, is pinned to a new draft for review. Earlier debts and discounts stay with their original admission. One active enrollment per academic year is supported."
            />
          </div>
        </details>
      )}
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
                  {a.offering} · {a.batch ?? "No batch recorded"}
                  {a.feeVersion !== null ? ` · Fee Plan v${a.feeVersion}` : ""} · {when(a.createdAt)}
                </p>
              </div>
              <StatusBadge value={a.status} />
            </div>
            {usable && a.studentId === s.id && a.status === "ENROLLED" && can("students.manage") && (
              <details>
                <summary className="cursor-pointer text-sm font-medium">Transfer Batch</summary>
                <div className="mt-3">
                  <StudentForm
                    defaults={{ action: "TRANSFER", student_id: s.id, admission_id: a.id }}
                    fields={[{
                      key: "batch_id", label: "Destination Batch",
                      options: options.filter((option) => {
                        const batch = data.batches.find((row) => row.id === option.id)!;
                        return batch.offeringId === a.offeringId && batch.id !== a.batchId && batch.occupied < batch.capacity;
                      }),
                    }]}
                    label="Confirm Batch Transfer"
                    description="Choose a different batch in the same offering. Capacity is checked before posting; Fee Plan, invoices and payment history are preserved."
                  />
                </div>
              </details>
            )}
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
                <th>End</th>
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
                  <td>{e.endsOn ?? "—"}</td>
                  <td>
                    <StatusBadge value={e.status} />
                    {usable && e.studentId === s.id && e.status === "ACTIVE" && can("students.manage") && (
                      <CloseEnrollmentForm studentId={s.id} enrollmentId={e.id} />
                    )}
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
        {data.transfers.map((transfer) => (
          <p key={transfer.id} className="mt-3 text-sm">
            Authorized transfer on {transfer.date}: {transfer.fromBatch} → {transfer.toBatch}. The previous enrollment was closed and retained.
          </p>
        ))}
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
                        {i.issueOn} · {i.studentNumber}{i.dueOn ? ` · Due ${i.dueOn}` : ""}
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
      {usable && can("students.manage") && (
        <section className="space-y-4 rounded-2xl border p-5">
          <h2 className="font-semibold">Duplicate Identity Review</h2>
          <p className="text-sm text-muted-foreground">
            Matches are suggestions, not proof. Siblings may share a guardian number. Review both profiles and verify the same person before confirming a merge.
          </p>
          {data.candidates.map((candidate) => (
            <div key={candidate.id} className="rounded-xl border p-4 text-sm">
              <Link className="font-medium underline" href={`/dashboard/students/${candidate.id}`}>
                {candidate.number} · {candidate.name}
              </Link>
              <p className="mt-1 text-muted-foreground">
                {candidate.status} · {candidate.school ?? "School not recorded"} · {candidate.mobile}
              </p>
            </div>
          ))}
          {!data.candidates.length ? (
            <p className="text-sm">No matching name or guardian mobile found.</p>
          ) : data.mergeBlocked ? (
            <p className="text-sm">
              This identity has open admission, active enrollment or already-linked identity history. Resolve the records through the controlled workflow before archiving it as a duplicate.
            </p>
          ) : (
            <StudentForm
              defaults={{ action: "MERGE", student_id: s.id }}
              fields={[{
                key: "target_id", label: "Keep This Canonical Student ID",
                options: data.candidates.map((candidate) => ({ id: candidate.id, name: `${candidate.number} · ${candidate.name}` })),
              }]}
              label="Confirm Duplicate Resolution"
              description={`Confirmation archives ${s.number} and links its history to the selected Student ID. No original invoice, payment, guardian record or number is deleted or reassigned. Explain the identity evidence in your reason. This merge cannot be undone through this screen.`}
            />
          )}
        </section>
      )}
    </div>
  );
}

