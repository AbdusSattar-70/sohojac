"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { TurnstileChallenge } from "@/components/security/turnstile-challenge";

type StaffRole = "ADMIN" | "OPERATOR" | "TEACHER" | "ACCOUNTANT";
const input = "mt-1.5 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

export function AccessRequestForm({siteKey, ready}: {siteKey: string; ready: boolean}) {
  const [securityToken,setSecurityToken] = useState("");
  const [securityReset,setSecurityReset] = useState(0);
  const [busy,setBusy] = useState(false);
  const [done,setDone] = useState(false);
  const [error,setError] = useState("");
  const [role,setRole] = useState<StaffRole>("TEACHER");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !ready || !securityToken) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const value = (field: string) => String(data.get(field) || "").trim();
    setError(""); setBusy(true);
    try {
      const response = await fetch("/api/staff/access-request", {
        method: "POST", credentials:"same-origin", cache:"no-store",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({
          fullName:value("fullName"), email:value("email"), mobile:value("mobile"),
          requestedRole:role, purpose:value("purpose"),
          consent: data.get("consent") === "on",
          website:value("website"), turnstileToken:securityToken,
        }),
      });
      if (!response.ok) {
        const result = await response.json() as {error?: string};
        setError(result.error || "Request could not be submitted.");
      } else {
        setDone(true);
      }
    } catch {setError("Connection failed. Please try again.");}
    finally {
      setBusy(false);
      setSecurityReset(value => value + 1);
    }
  }

  if(done) return <section role="status" aria-live="polite"
    className="space-y-5 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-5 text-sm leading-7 sm:p-6">
    <div className="flex items-start gap-3">
      <span aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-400/20 text-xl font-bold text-emerald-200">
        ✓
      </span>
      <div className="space-y-2">
        <h2 className="text-xl font-bold tracking-tight text-emerald-200">Request received</h2>
        <p className="leading-7 text-slate-100">
          Your staff access request has been submitted for administrator review.
        </p>
      </div>
    </div>
    <p className="text-slate-200">
      If eligible, you will receive account setup instructions after identity and
      responsibilities are verified. This confirmation does not create a staff account
      or guarantee access.
    </p>
    <Link href="/sign-in"
      className="inline-flex min-h-11 items-center rounded-xl border border-emerald-300/40 px-4 font-semibold text-emerald-100 underline-offset-4 hover:bg-emerald-500/10 focus-visible:outline-2 focus-visible:outline-blue-400">
      Return to sign in
    </Link>
  </section>;

  return <form className="space-y-5" onSubmit={submit}>
    <div className="grid gap-5 sm:grid-cols-2">
      <label className="block text-sm font-semibold">Full name
        <input name="fullName" required minLength={2} maxLength={160} autoComplete="name" className={input}/>
      </label>
      <label className="block text-sm font-semibold">Contact mobile
        <input name="mobile" required inputMode="numeric" maxLength={11} pattern="01[3-9][0-9]{8}"
          placeholder="01XXXXXXXXX" autoComplete="tel" className={input}/>
      </label>
    </div>
    <label className="block text-sm font-semibold">Email for account invitation
      <input type="email" name="email" required maxLength={254} autoComplete="email" className={input}/>
    </label>
    <label className="block text-sm font-semibold">Requested responsibility
      <select value={role} onChange={event=>setRole(event.target.value as StaffRole)} className={input}>
        <option value="TEACHER">Teacher</option>
        <option value="OPERATOR">Operations / Admissions</option>
        <option value="ACCOUNTANT" disabled>Accounts / Finance (not yet available)</option>
        <option value="ADMIN">Administration</option>
      </select>
    </label>
    <label className="block text-sm font-semibold">Why do you need access?
      <textarea name="purpose" rows={4} required minLength={5} maxLength={500}
        placeholder="Your work, responsibilities and who can verify your identity"
        className={input+" resize-y"}/>
    </label>
    <label className="flex items-start gap-2.5 text-sm text-slate-600">
      <input type="checkbox" name="consent" required className="mt-1 size-4"/>
      I agree that Sohoj Academy may use these details to verify my request and contact me about staff access.
    </label>
    <div className="absolute -left-[10000px]" aria-hidden="true">
      <label>Leave this empty <input type="text" name="website" tabIndex={-1} autoComplete="off"/></label>
    </div>
    {ready && <TurnstileChallenge action="staff-access-request" onToken={setSecurityToken} resetKey={securityReset} />}
    {!ready && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      Access requests are temporarily unavailable while security verification is being configured.
    </p>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <button type="submit" disabled={busy||!ready||!securityToken}
      className="min-h-11 w-full rounded-xl bg-blue-700 px-5 text-sm font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
      {busy?"Submitting…":"Submit access request"}
    </button>
    <p className="text-xs leading-6 text-slate-500">This form never creates a login. Public signup and access to student or guardian records remain disabled until staff approval.</p>
  </form>;
}
