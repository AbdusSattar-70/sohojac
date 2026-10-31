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
      <section id="email-delivery" aria-labelledby="staff-email-setup-heading"
        className="scroll-mt-24 space-y-4 rounded-2xl border border-border bg-card p-5">
        <h2 id="staff-email-setup-heading" className="text-lg font-semibold">
          Configure staff invitation email for development
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Resend is the transactional email provider. The public request form can collect
          applications without it, but secure invitations cannot be sent until the sender
          domain and deployment secrets are configured. Never paste an email API key
          into this page, a pull request or an application record.
        </p>
        <ol className="list-decimal space-y-3 pl-5 text-sm leading-6">
          <li>In <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer"
            className="font-semibold text-primary underline underline-offset-4">Resend Domains</a>,
            add and verify the sending domain. Copy only the DNS entries supplied by Resend into
            your Cloudflare DNS. SPF and DKIM must pass; use DMARC as recommended by the provider.
          </li>
          <li>Create a Resend API key with sending-only access, scoped to the verified domain.
            In the Sohojac GitHub repository under Settings → Secrets and variables → Actions,
            save it as the <code>DEV_RESEND_API_KEY</code> repository secret.
          </li>
          <li>Add two Actions <strong>variables</strong>:
            <code className="mx-1">DEV_STAFF_EMAIL_FROM</code> for a verified sender such as
            <code className="mx-1">Sohoj Academy &lt;info@sohojac.com&gt;</code> (only after domain verification),
            and <code className="mx-1">DEV_STAFF_EMAIL_ALLOWLIST</code> containing a comma-separated
            list of your approved test inboxes. Avoid real guardian or staff recipients in development.
          </li>
          <li>For the email signature, you may also set the optional Actions variable
            <code className="mx-1">DEV_STAFF_EMAIL_POSTAL_ADDRESS</code> to your verified,
            public office address. It appears in the invitation footer. If it is not
            configured, the footer only states the general location, Jamalpur, Bangladesh;
            the application does not invent a street address.
          </li>
          <li>After the next successful <code>dev</code> deployment, open the Staff &amp; access
            page and check the three configuration indicators. They show configured values,
            <strong> not</strong> that the provider delivered a message.
          </li>
          <li>Review a real access request and its supported role, then send a single test
            invitation only to an allowlisted inbox. Verify receipt and activation manually.
            Existing requests marked as ACCOUNTANT cannot be activated until the finance role
            policy exists; do not approve another role unless the job actually requires it.
          </li>
        </ol>
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          Development and production use separate secrets. This setup does not modify
          the production Worker or production staff invitations.
        </p>
      </section>
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
