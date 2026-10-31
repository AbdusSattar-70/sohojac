import Link from "next/link";
import {PageHeader} from "@/components/erp/page-header";
import {requirePermission} from "@/modules/platform/auth/erp-context";

export const metadata = {
  title: "Staff account setup & roles · Sohoj Academy",
  robots: {index: false, follow: false},
};

const steps = [
  {
    title: "Applicant requests access",
    detail: "From the staff sign-in screen select Request an account. Enter your identity, contact details, requested responsibility, and complete the security check. Submitting the request never creates an ERP account or grants access.",
  },
  {
    title: "Owner or administrator verifies",
    detail: "Open Staff & access → Pending setup. Verify the person's identity and intended responsibilities, select an allowed role and write an auditable explanation. Only the owner can assign ADMIN; ACCOUNTANT cannot be activated until that role is supported.",
  },
  {
    title: "Send secure invitation",
    detail: "After verification, choose Send account setup. The system sends a single-use password setup link to the approved email; staff email delivery must be configured. If delivery fails, retry the verified request after the stated cooldown. Do not share an invitation token in chat.",
  },
  {
    title: "Applicant activates account",
    detail: "The recipient follows the invitation link before expiry, chooses a password and then signs in. A linked staff identity and permanent staff number are created automatically during activation. No administrator should create a second staff record manually.",
  },
  {
    title: "Review access and ongoing management",
    detail: "Use Completed / closed requests to review prior decisions. The existing staff section below the requests lists authorized identities for permitted management and lifecycle updates. Disable an account when an employee should no longer have access.",
  },
] as const;

export default async function StaffAccountGuide() {
  await requirePermission("system.users.manage");
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="People & access"
        title="Staff account setup and role assignment"
        description="A single verified request-to-invitation workflow. There is no separate manual staff registration."
        actions={<Link href="/dashboard/staff#staff-access"
          className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted">
          Back to staff requests
        </Link>}
      />
      <ol className="space-y-4">
        {steps.map((step, index) => (
          <li key={step.title} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start gap-4">
              <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-sm font-semibold">{index + 1}</span>
              <div className="space-y-2">
                <h2 className="font-semibold">{step.title}</h2>
                <p className="text-sm leading-6 text-muted-foreground">{step.detail}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-semibold">If a request is missing</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Pending setup contains pending, verified and invited requests; Completed / closed requests contains activated and declined requests.
          Check the correct status filter. If no applicant has submitted a request, the list is empty.
          Staff may start from the public request page; you cannot create their account on their behalf.
        </p>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/request-access" target="_blank" rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-xl border px-4 font-semibold hover:bg-muted">Open public staff request form</Link>
          <Link href="/dashboard/staff?requestsView=history#staff-access"
            className="inline-flex min-h-11 items-center rounded-xl border px-4 font-semibold hover:bg-muted">View completed requests</Link>
        </div>
      </section>
    </div>
  );
}
