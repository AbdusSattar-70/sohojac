"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
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
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-2xl border border-slate-700 bg-slate-900 p-7 text-white shadow-xl">
        <h1 className="text-2xl font-semibold">Sohojac staff sign-in</h1>
        <p className="text-sm text-slate-300">Authorized academy staff only.</p>
        <label className="block text-sm font-medium">
          Email
          <input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-600 bg-slate-950 px-3 py-2 text-white" />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border px-3 py-2" />
        </label>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        <button type="submit" disabled={busy} className="w-full rounded-md bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-500 disabled:opacity-50">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
