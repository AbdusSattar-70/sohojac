"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import Logo from "@/components/shared/logo";

export default function ResetPasswordPage() {
  return <Suspense fallback={<main className="staff-auth-dark flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">Preparing secure password reset…</main>}>
    <ResetPasswordForm />
  </Suspense>;
}

function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token");
  const invalid = params.has("error") || !token;
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !token) return;
    if (password.length < 8 || password.length > 128 || password !== confirm) {
      setError("Choose a matching password with 8–128 characters.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) {
        setError("This reset link could not be used. Request a new link.");
      } else {
        setComplete(true);
        setPassword("");
        setConfirm("");
        // Remove the secret from browser history after use.
        window.history.replaceState(null, "", "/reset-password");
      }
    } catch {
      setError("Could not reset your password. Please try again.");
    } finally { setBusy(false); }
  }

  return <main lang="en" className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 text-slate-900">
    <div className="w-full max-w-md space-y-6 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
      <div className="flex items-center gap-3">
        <Logo size={43} variant="mark" />
        <div><p className="text-sm font-extrabold">Sohoj Academy</p>
          <p className="text-xs text-slate-500">Digital Campus · Staff Portal</p></div>
      </div>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Set a new password</h1>
        <p className="mt-2 text-sm text-slate-600">A successful reset signs out your other sessions.</p>
      </div>
      {complete ? <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
        Your password has been updated. Sign in again with the new password.
      </div> : invalid ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        This reset link is missing, invalid, or expired.
      </div> : <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-semibold">New password (8–128 characters)
          <input type="password" required minLength={8} maxLength={128} autoComplete="new-password"
            value={password} onChange={event => setPassword(event.target.value)}
            className="mt-1.5 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus-visible:outline-2 focus-visible:outline-blue-600" />
        </label>
        <label className="block text-sm font-semibold">Confirm new password
          <input type="password" required minLength={8} maxLength={128} autoComplete="new-password"
            value={confirm} onChange={event => setConfirm(event.target.value)}
            className="mt-1.5 block min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus-visible:outline-2 focus-visible:outline-blue-600" />
        </label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy || password !== confirm} className="min-h-11 w-full rounded-lg bg-blue-700 px-4 text-sm font-bold text-white disabled:opacity-50">
          {busy ? "Updating…" : "Update password"}
        </button>
      </form>}
      <div className="flex flex-wrap gap-4 text-sm font-semibold">
        <Link href="/forgot-password" className="text-blue-700 hover:underline">Request another link</Link>
        <Link href="/sign-in" className="text-blue-700 hover:underline">Return to sign in</Link>
      </div>
    </div>
  </main>;
}
