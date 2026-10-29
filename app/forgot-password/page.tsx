"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import Logo from "@/components/shared/logo";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      // Fixed same-origin path prevents user-controlled redirect URLs.
      await authClient.requestPasswordReset({
        email: email.trim().toLowerCase(),
        redirectTo: window.location.origin + "/reset-password",
      });
      // Never reveal if the address belongs to a staff account.
      setComplete(true);
    } catch {
      setError("Could not send the request. Please try again later.");
    } finally {
      setBusy(false);
    }
  }

  return <main lang="en" className="staff-auth-dark flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 text-slate-900">
    <div className="w-full max-w-md space-y-6 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
      <div className="flex items-center gap-3">
        <Logo size={43} variant="mark" />
        <div><p className="text-sm font-extrabold">Sohoj Academy</p>
          <p className="text-xs text-slate-500">Digital Campus · Staff Portal</p></div>
      </div>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Reset your password</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Enter the email attached to your staff account.</p>
      </div>
      {complete ? <div role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
        If an active staff account uses that address and email delivery is available, a password reset link will be sent.
        Check your inbox and spam folder. Links expire after 30 minutes.
      </div> : <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-semibold">Staff email
          <input autoComplete="email" type="email" required maxLength={254} value={email}
            onChange={event => setEmail(event.target.value)}
            className="mt-1.5 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-blue-600" />
        </label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy} className="min-h-11 w-full rounded-lg bg-blue-700 px-4 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">
          {busy ? "Requesting…" : "Send reset link"}
        </button>
      </form>}
      <Link href="/sign-in" className="inline-block text-sm font-semibold text-blue-700 hover:underline">Back to sign in</Link>
      <p className="text-xs text-slate-500">Staff access is managed by Sohoj Academy. No public staff account is created here.</p>
    </div>
  </main>;
}
