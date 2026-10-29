"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { reconcileLegacyProspect } from "@/modules/crm/reconciliation-actions";

export function ProspectReconciliationForm({ prospectId }: { prospectId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await reconcileLegacyProspect({
          prospectId,
          newStatus: data.get("newStatus"),
          reason: data.get("reason"),
        });
        setMessage({ ok: result.ok, text: result.message });
        if (result.ok) router.refresh();
      } catch {
        setMessage({ ok: false, text: "Reconciliation failed. Please refresh and retry." });
      }
    });
  }

  return (
    <section className="rounded-2xl border border-amber-700/40 bg-card p-5 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-400">
        Historical enquiry review
      </p>
      <h2 className="mt-2 text-lg font-semibold">Reconcile old CLOSED status</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        The previous website did not distinguish lost, converted, or reopened requests.
        Check the original enquiry and follow-up history before selecting a source CRM status.
        This change is permanently audited; it does not create an admission or student.
      </p>
      <form onSubmit={onSubmit} className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium">
          Verified classification
          <select name="newStatus" defaultValue="" required disabled={pending}
            className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3 text-foreground">
            <option value="" disabled>Choose after reviewing evidence</option>
            <option value="NEW">New / needs initial contact</option>
            <option value="CONTACTED">Contacted / continue counselling</option>
            <option value="LOST">Lost / no further intake</option>
          </select>
        </label>
        <label className="text-sm font-medium md:col-span-2">
          Evidence and reason
          <textarea name="reason" minLength={12} maxLength={500} rows={3} required disabled={pending}
            placeholder="Describe the historical record or contact that supports the classification."
            className="mt-2 w-full rounded-xl border bg-background px-3 py-2 text-foreground" />
        </label>
        <div className="flex items-center justify-between gap-4 md:col-span-2">
          <p role="status" aria-live="polite" className={message?.ok ? "text-sm text-emerald-400" : "text-sm text-amber-400"}>
            {message?.text ?? ""}
          </p>
          <button type="submit" disabled={pending}
            className="min-h-11 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-50">
            {pending ? "Saving review…" : "Save audited classification"}
          </button>
        </div>
      </form>
    </section>
  );
}
