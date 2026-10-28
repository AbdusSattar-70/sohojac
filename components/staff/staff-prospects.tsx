"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

type Status = "NEW" | "CONTACTED" | "CLOSED";
type Prospect = {
  id: string; reference: string; intent: string; student_name: string;
  class_name: string; school_name: string | null; guardian_name: string;
  mobile: string; area: string | null; programme: string | null;
  status: Status; submitted_at: string;
};
type Event = { from_status: string; to_status: string; note: string; occurred_at: string };
type State = { status: Status; note: string };
const statuses: Status[] = ["NEW", "CONTACTED", "CLOSED"];
const inputStyle = "rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400";
const btnStyle = "rounded-lg border border-slate-700 px-3 py-2 text-sm hover:border-blue-400 disabled:cursor-not-allowed disabled:opacity-50";

export function StaffProspects({ staffName, role }: { staffName: string; role: string }) {
  const router = useRouter();
  const [items, setItems] = useState<Prospect[]>([]);
  const [totals, setTotals] = useState<{status: string; count: number}[]>([]);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, State>>({});
  const [history, setHistory] = useState<Record<string, Event[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const params = new URLSearchParams({ page: String(page), status: statusFilter });
      if (search) params.set("q", search);
      const res = await fetch("/api/staff/prospects?" + params, {
        credentials: "same-origin", cache: "no-store",
      });
      if (res.status === 401) {
        router.replace("/sign-in");
        return;
      }
      if (!res.ok) throw new Error(res.status === 403 ? "Your role cannot view prospects." : "Could not load enquiries.");
      const data = await res.json() as {
        items: Prospect[]; totals: {status: string; count: number}[]; hasMore: boolean;
      };
      setItems(data.items);
      setTotals(data.totals);
      setHasMore(data.hasMore);
      setDrafts(Object.fromEntries(data.items.map(item => [item.id, { status: item.status, note: "" }])));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load enquiries.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search, router]);

  useEffect(() => { void load(); }, [load]);

  async function update(item: Prospect) {
    const draft = drafts[item.id] ?? { status: item.status, note: "" };
    if (draft.status === item.status && !draft.note) return;
    setBusy(item.id);
    setMessage("");
    try {
      const response = await fetch("/api/staff/prospects/" + encodeURIComponent(item.id), {
        method: "PATCH", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!response.ok) {
        const payload = await response.json() as {error?: string};
        throw new Error(payload.error || "Update failed");
      }
      setMessage("Prospect saved with an audit entry.");
      setHistory(old => { const next = { ...old }; delete next[item.id]; return next; });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Update failed");
    } finally { setBusy(null); }
  }

  async function showHistory(id: string) {
    if (history[id]) { setHistory(old => { const next = { ...old }; delete next[id]; return next; }); return; }
    try {
      const response = await fetch("/api/staff/prospects/" + encodeURIComponent(id), { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load audit history.");
      const data = await response.json() as {events: Event[]};
      setHistory(old => ({ ...old, [id]: data.events }));
    } catch { setMessage("Could not load audit history."); }
  }

  const sum = (status: string) => totals.find(t => t.status === status)?.count ?? 0;

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-10 text-slate-100 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/app" className="text-sm text-blue-300 underline">Staff workspace</Link>
          <h1 className="mt-2 text-3xl font-semibold">Prospect CRM</h1>
          <p className="mt-1 text-sm text-slate-400">Signed in: {staffName} · {role}</p>
        </div>
        <button className={btnStyle} type="button" onClick={async () => {
          await authClient.signOut(); router.replace("/sign-in"); router.refresh();
        }}>Sign out</button>
      </header>

      <section aria-label="Prospect totals" className="grid grid-cols-3 gap-3">
        {statuses.map(status => <div key={status} className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
          <p className="text-xs text-slate-400">{status}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{sum(status)}</p>
        </div>)}
      </section>

      <form className="flex flex-wrap gap-3" onSubmit={event => {
        event.preventDefault(); setPage(1); setSearch(q.trim());
      }}>
        <label className="min-w-52 flex-1 text-sm">Search by reference, student or mobile
          <input className={inputStyle + " mt-1 block w-full"} maxLength={80} value={q}
            onChange={e => setQ(e.target.value)} placeholder="Search enquiries" />
        </label>
        <label className="text-sm">Status
          <select className={inputStyle + " mt-1 block"} value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="ALL">All</option>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <button type="submit" className={btnStyle + " self-end"}>Search</button>
        <button type="button" className={btnStyle + " self-end"} onClick={() => void load()}>Refresh</button>
      </form>

      <p role="status" aria-live="polite" className="min-h-5 text-sm text-amber-300">{message}</p>
      {loading ? <p className="text-slate-400">Loading enquiries…</p> : items.length === 0 ?
        <p className="rounded-xl border border-slate-700 p-6 text-slate-400">No enquiries match these filters.</p> :
        <div className="space-y-4">
          {items.map(item => {
            const draft = drafts[item.id] ?? { status: item.status, note: "" };
            return <section key={item.id} className="rounded-xl border border-slate-700 bg-slate-900/65 p-4 sm:p-5">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-blue-300">{item.reference}</p>
                  <h2 className="mt-1 text-lg font-semibold">{item.student_name} · {item.class_name}</h2>
                  <p className="text-sm text-slate-300">{item.programme || "General enquiry"} · {item.intent}</p>
                  <p className="text-xs text-slate-400">{new Date(item.submitted_at).toLocaleString("en-BD", { timeZone: "Asia/Dhaka" })}</p>
                </div>
                <div className="text-sm">
                  <p>Guardian: <strong>{item.guardian_name}</strong></p>
                  <a href={"tel:" + item.mobile} className="text-blue-300 underline">{item.mobile}</a>
                  <p className="text-slate-400">{item.school_name || "School not specified"}</p>
                  {item.area && <p className="text-slate-400">{item.area}</p>}
                </div>
              </div>
              <div className="mt-4 grid gap-3 border-t border-slate-700 pt-4 sm:grid-cols-[minmax(9rem,1fr)_minmax(12rem,2fr)_auto] sm:items-end">
                <label className="text-sm">Follow-up status
                  <select className={inputStyle + " mt-1 block w-full"} value={draft.status}
                    onChange={e => setDrafts(old => ({ ...old, [item.id]: { ...draft, status: e.target.value as Status } }))}>
                    {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="text-sm">Follow-up note (internal)
                  <input className={inputStyle + " mt-1 block w-full"} value={draft.note} maxLength={1000}
                    placeholder="Call outcome or next action"
                    onChange={e => setDrafts(old => ({ ...old, [item.id]: { ...draft, note: e.target.value } }))}/>
                </label>
                <button type="button" className={btnStyle} disabled={busy !== null ||
                  (draft.status === item.status && !draft.note.trim())} onClick={() => void update(item)}>
                  {busy === item.id ? "Saving…" : "Save"}
                </button>
              </div>
              <button className="mt-3 text-xs text-blue-300 underline" type="button" onClick={() => void showHistory(item.id)}>
                {history[item.id] ? "Hide audit trail" : "View audit trail"}
              </button>
              {history[item.id] && <div className="mt-3 space-y-2 border-t border-slate-700 pt-3 text-xs">
                {history[item.id].length === 0 ? <p>No follow-up actions yet.</p> :
                  history[item.id].map((e, index) => <p key={index}>
                    {e.from_status} → {e.to_status} · {new Date(e.occurred_at).toLocaleString("en-BD", {timeZone: "Asia/Dhaka"})}
                    {e.note && <> · {e.note}</>}
                  </p>)}
              </div>}
            </section>;
          })}
        </div>}
      <nav className="flex items-center justify-between gap-3" aria-label="Prospect pagination">
        <button type="button" className={btnStyle} disabled={loading || page <= 1}
          onClick={() => setPage(p => p - 1)}>Previous</button>
        <span className="text-sm text-slate-400">Page {page}</span>
        <button type="button" className={btnStyle} disabled={loading || !hasMore}
          onClick={() => setPage(p => p + 1)}>Next</button>
      </nav>
      <p className="text-xs text-slate-400">All enquiries are unverified. Status updates do not create student accounts, tuition charges or admission records.</p>
    </main>
  );
}
