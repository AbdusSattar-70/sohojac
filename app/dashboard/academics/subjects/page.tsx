import Link from "next/link";
import { PageHeader } from "@/components/erp/page-header";
import { getCanonicalSubjectDirectory } from "@/modules/academics/subjects/queries";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Subject Directory · Sohoj Academy ERP",
  robots: { index: false, follow: false },
};

const heading = "text-xs font-semibold uppercase tracking-wide text-muted-foreground";
const card = "rounded-2xl border border-border bg-card p-5";
const action = "inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default async function SubjectsPage() {
  const directory = await getCanonicalSubjectDirectory();
  return (
    <main className="space-y-6" data-canonical-subject-directory>
      <PageHeader
        eyebrow="Academic setup"
        title="Subject Directory"
        description="Maintain one global subject definition. Classes, groups and teaching packages will use separate curriculum relationships—not new copies of the same subject."
        actions={<Link href="/dashboard/academics/settings?section=subject" className={action}>
          Manage global subjects
        </Link>}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <section className={card}>
          <p className={heading}>Global subjects</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums">{directory.subjects.length}</p>
          <p className="mt-1 text-sm text-muted-foreground">{directory.activeGlobalSubjects} active</p>
        </section>
        <section className={card}>
          <p className={heading}>Legacy subject variants</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums">{directory.legacySubjects.length}</p>
          <p className="mt-1 text-sm text-muted-foreground">Held only for historical links</p>
        </section>
        <section className={card}>
          <p className={heading}>Legacy offering links</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums">{directory.legacyOfferingLinks}</p>
          <p className="mt-1 text-sm text-muted-foreground">Must survive a future ID migration</p>
        </section>
      </div>

      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Global subject catalogue</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Each subject is defined once. Manage its name and active status through Academic Settings.
            </p>
          </div>
          <Link className={action} href="/dashboard/academics/settings?section=subject">Edit subjects</Link>
        </div>
        {directory.subjects.length === 0 ? (
          <p className="mt-5 rounded-xl border border-border bg-muted p-4 text-sm">
            No global subjects were found. Add them in Academic Settings before creating subject-specific teaching plans.
          </p>
        ) : (
          <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {directory.subjects.map((subject) => (
              <div key={subject.id} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-border bg-background p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{subject.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{subject.code}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-1 text-xs ${subject.active
                  ? "border-emerald-500/40 text-emerald-300"
                  : "border-border text-muted-foreground"}`}>
                  {subject.active ? "Active" : "Inactive"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={card}>
        <div>
          <h2 className="text-lg font-semibold">Historical offering associations</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Previously published subject links may refer to class-specific legacy IDs.
            These IDs are retained to protect existing programme cards and audit history.
            Subjects with the same name are <strong className="text-foreground">not automatically merged</strong>;
            an explicitly reviewed identity crosswalk is required.
          </p>
        </div>
        {directory.legacySubjects.length === 0 ? (
          <div className="mt-4 rounded-xl border border-border bg-muted/40 p-4">
            <p className="font-medium">No class-specific legacy subjects</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This development database currently needs no legacy offering-subject backfill.
              The global catalogue above is the single directory for new academic setup.
            </p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Legacy subject</th>
                  <th scope="col" className="px-4 py-3 font-medium">Class / group</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Linked offerings</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {directory.legacySubjects.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3">
                      <span className="block font-medium">{row.name}</span>
                      <span className="text-xs text-muted-foreground">{row.code}</span>
                    </td>
                    <td className="px-4 py-3">Class {row.classGrade} · {row.groupName.replaceAll("_", " ")}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.linkedOfferings}</td>
                    <td className="px-4 py-3">{row.linkedOfferings > 0 ? "Identity review required" : "Unlinked legacy"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          Migration gate: preserve original subject IDs and every offering link; verify the mapping in
          an isolated database before any production cutover. This page does not rewrite financial,
          assessment, timetable or public-card records.
        </p>
      </section>
    </main>
  );
}
