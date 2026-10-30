"use client";
import { TurnstileChallenge } from "@/components/security/turnstile-challenge";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function OwnerSetupPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [securityToken, setSecurityToken] = useState("");
  const [securityReset, setSecurityReset] = useState(0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !securityToken) return;
    if (password.length < 8 || password.length > 128) {
      setError("Use a password of 8–128 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/setup-owner", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json", "x-turnstile-token": securityToken },
        body: JSON.stringify({ token: token.trim(), password }),
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) {
        setError(result.error || "Setup could not be completed.");
        return;
      }
      setToken("");
      setPassword("");
      setConfirmPassword("");
      router.replace("/sign-in");
      router.refresh();
    } catch {
      setError("Could not connect. Check the website and try again.");
    } finally {
      setSecurityReset(value => value + 1);
      setBusy(false);
    }
  }

  return (
    <main className="staff-auth-dark min-h-screen bg-slate-950 px-4 py-12 text-white">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-lg sm:p-8">
        <p className="text-xs font-semibold tracking-widest text-blue-300">SOHOJ ACADEMY · FIRST OWNER</p>
        <h1 className="mt-3 text-2xl font-bold">Set owner password</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          This is a one-time setup. Your owner email and name are already recorded
          in Cloudflare D1. Enter the temporary 64-character setup code from the
          D1 console and choose your password.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium">
            Temporary setup code
            <input value={token} onChange={e => setToken(e.target.value.toLowerCase())}
              autoComplete="off" autoCapitalize="none" spellCheck={false}
              minLength={64} maxLength={64} required
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 font-mono text-xs text-white"
              placeholder="Copy the code from Cloudflare D1" />
          </label>
          <label className="block text-sm font-medium">
            New password (at least 8 characters)
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              autoComplete="new-password" minLength={8} maxLength={128} required
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 text-white" />
          </label>
          <label className="block text-sm font-medium">
            Confirm new password
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              autoComplete="new-password" minLength={8} maxLength={128} required
              className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 text-white" />
          </label>
          {error && <p role="alert" className="rounded-lg border border-red-800 bg-red-950/60 p-3 text-sm text-red-200">{error}</p>}
          <TurnstileChallenge action="staff-owner-setup" onToken={setSecurityToken} resetKey={securityReset} />
          <button disabled={busy || !securityToken || token.trim().length !== 64 || password.length < 8 || password !== confirmPassword}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? "Setting up…" : "Create owner account"}
          </button>
          <p className="text-xs text-slate-400">No public signup is enabled. The temporary code expires after 30 minutes and cannot be used again.</p>
        </form>
      </div>
    </main>
  );
}
