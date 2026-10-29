import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/shared/logo";
import { isStaffOrigin } from "@/lib/auth";
import { AccessRequestForm } from "@/components/staff/access-request-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Request staff access · Sohoj Academy", robots:{index:false,follow:false} };

export default async function StaffAccessPage() {
  const h = await headers();
  const origin = (env as typeof env & {BETTER_AUTH_URL?: string}).BETTER_AUTH_URL ?? "";
  if (!isStaffOrigin(origin)) notFound();
  const configured = new URL(origin);
  if (h.get("host")?.toLowerCase() !== configured.host.toLowerCase()) notFound();

  const bindings = env as typeof env & {TURNSTILE_SITE_KEY?: string;TURNSTILE_SECRET_KEY?: string};
  const isLocal = ["localhost","127.0.0.1"].includes(configured.hostname);
  const siteKey = bindings.TURNSTILE_SITE_KEY ?? "";
  const ready = isLocal || Boolean(siteKey && bindings.TURNSTILE_SECRET_KEY);
  return <main lang="en" className="staff-auth-dark flex min-h-screen justify-center bg-slate-50 px-4 py-12 text-slate-900">
    <div className="w-full max-w-2xl space-y-7">
      <Link href="/sign-in" className="inline-block text-sm font-bold text-blue-700 hover:underline">← Return to sign in</Link>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-3">
          <Logo size={42} variant="mark"/>
          <div><p className="text-sm font-extrabold">Sohoj Academy</p>
            <p className="text-xs text-slate-500">Digital Campus · Staff Access</p></div>
        </div>
        <h1 className="mt-6 text-2xl font-extrabold tracking-tight">Request staff access</h1>
        <p className="mt-2 mb-7 text-sm leading-6 text-slate-600">
          Submit your details for identity and responsibility verification.
          The academy will review the request before issuing any invitation.
        </p>
        <AccessRequestForm siteKey={siteKey} ready={ready}/>
      </section>
    </div>
  </main>;
}
