"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/shared/logo";
import { authClient } from "@/lib/auth-client";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        setError("Sign-in failed. Check your credentials or contact the administrator.");
        return;
      }
      router.push("/app");
      router.refresh();
    } catch {
      setError("Unable to connect to authentication. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main lang="en" className="staff-auth-dark flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 text-slate-900">
      <form onSubmit={submit} className="w-full max-w-md space-y-6 rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="flex items-center gap-3">
          <Logo size={44} variant="mark"/>
          <div><p className="text-sm font-extrabold">Sohoj Academy</p>
            <p className="text-xs text-slate-500">Digital Campus · Staff Portal</p></div>
        </div>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-sm text-slate-600">Sign in with your authorized staff account.</p>
        </div>
        <label className="block text-sm font-semibold">
          Email address
          <input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)}
            className="mt-1.5 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-blue-600" />
        </label>
        <label className="block text-sm font-semibold">
          <span className="flex items-center justify-between gap-3">
            Password
            <Link href="/forgot-password" className="text-xs font-semibold text-blue-700 hover:underline">Forgot password?</Link>
          </span>
          <input type="password" autoComplete="current-password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)}
            className="mt-1.5 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-blue-600" />
        </label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy} className="min-h-11 w-full rounded-lg bg-blue-700 px-4 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-center text-sm text-slate-600">
          Need staff access? <Link href="/request-access" className="font-bold text-blue-700 hover:underline">Request an account</Link>
        </p>
        <p className="text-center text-xs text-slate-500">Access requests require an administrator's approval. No public staff account is created automatically.</p>
      </form>
    </main>
  );
}
