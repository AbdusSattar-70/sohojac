"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Clock3, RefreshCw,
  Search, UserRoundSearch, UsersRound, X,
} from "lucide-react";
import { useRouter } from "next/navigation";

type Status = "NEW" | "CONTACTED" | "CLOSED";
type Prospect = {
  id: string; reference: string; intent: string; student_name: string;
  class_name: string; school_name: string | null; guardian_name: string;
  mobile: string; area: string | null; programme: string | null;
  status: Status; submitted_at: string;
};
type HistoryEvent = { from_status: string; to_status: string; note: string; occurred_at: string; actor_name: string };
type EditState = { status: Status; note: string };
type Filter = Status | "ALL";
const statuses: Status[] = ["NEW", "CONTACTED", "CLOSED"];
const names: Record<Status, string> = {
  NEW: "New", CONTACTED: "Contacted", CLOSED: "Closed",
};
const input = "block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600";
const button = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50";

function StatusTag({ value }: { value: Status }) {
  return <span className={"inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold " +
    (value === "NEW" ? "bg-amber-50 text-amber-800 ring-1 ring-amber-100" :
      value === "CONTACTED" ? "bg-blue-50 text-blue-800 ring-1 ring-blue-100" :
        "bg-slate-100 text-slate-600 ring-1 ring-slate-200")}>{names[value]}</span>;
}

export function StaffProspects({ initialStatus = "ALL" }: { initialStatus?: Filter }) {
  const router = useRouter();
  const [items, setItems] = useState<Prospect[]>([]);
  const [totals, setTotals] = useState<{ status: string; count: number }[]>([]);
  const [filter, setFilter] = useState<Filter>(initialStatus);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, EditState>>({});
  const [events, setEvents] = useState<Record<string, HistoryEvent[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => { setFilter(initialStatus); setPage(1); }, [initialStatus]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), status: filter });
      if (search) params.set("q", search);
      const result = await fetch("/api/staff/prospects?" + params, {
        credentials: "same-origin", cache: "no-store",
      });
      if (result.status === 401) { router.replace("/sign-in"); return; }
      if (!result.ok) throw new Error(result.status === 403 ? "Your role cannot access enquiries." : "Could not load enquiries.");
      const data = await result.json() as {
        items: Prospect[]; totals: { status: string; count: number }[]; hasMore: boolean;
      };
      setItems(data.items);
      setTotals(data.totals);
      setHasMore(data.hasMore);
      setDrafts(Object.fromEntries(data.items.map(item => [
        item.id, { status: item.status, note: "" },
      ])));
    } catch (error) {
      setItems([]);
      setMessage(error instanceof Error ? error.message : "Unable to load enquiries.");
    } finally { setLoading(false); }
  }, [filter, page, search, router]);

  useEffect(() => { void load(); }, [load]);

  async function save(item: Prospect) {
    const draft = drafts[item.id] ?? { status: item.status, note: "" };
    if (draft.status === item.status && !draft.note.trim()) return;
    setBusy(item.id);
    setMessage("");
    try {
      const response = await fetch("/api/staff/prospects/" + encodeURIComponent(item.id), {
        method: "PATCH", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: draft.status, note: draft.note.trim() }),
      });
      if (response.status === 401) { router.replace("/sign-in"); return; }
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error || "Could not save follow-up.");
      }
      setEvents(previous => {
        const next = { ...previous };
        delete next[item.id];
        return next;
      });
      await load();
      setMessage("Follow-up saved. An audit event was recorded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save follow-up.");
    } finally { setBusy(null); }
  }

  async function toggleHistory(id: string) {
    if (events[id]) {
      setEvents(previous => { const next = { ...previous }; delete next[id]; return next; });
      return;
    }
    try {
      const response = await fetch("/api/staff/prospects/" + encodeURIComponent(id), {
        credentials: "same-origin", cache: "no-store",
      });
      if (response.status === 401) { router.replace("/sign-in"); return; }
      if (!response.ok) throw new Error();
      const data = await response.json() as { events: HistoryEvent[] };
      setEvents(previous => ({ ...previous, [id]: data.events }));
    } catch { setMessage("Could not load this prospect's audit history."); }
  }

  function resetSearch() {
    setQuery(""); setSearch(""); setFilter("ALL"); setPage(1);
  }

  const total = (status: Status) => totals.find(t => t.status === status)?.count ?? 0;
  const totalAll = statuses.reduce((sum, status) => sum + total(status), 0);

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
      <div>
        <Link href="/app" className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline">
          <ArrowLeft size={14}/> Digital Campus
        </Link>
        <p className="mt-3 text-xs font-bold uppercase tracking-[0.16em] text-blue-700">CRM & applications</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Enquiries</h1>
        <p className="mt-2 text-sm text-slate-500">
          Review public registrations, track guardian follow-up and record decisions.
        </p>
      </div>
      <button className={button} onClick={() => { setMessage(""); void load(); }} disabled={loading}>
        <RefreshCw size={16} aria-hidden="true"/> Refresh register
      </button>
    </div>

    <section aria-label="CRM status summary" className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {([
        { key: "ALL" as const, label: "All enquiries", value: totalAll, icon: UsersRound },
        { key: "NEW" as const, label: "New", value: total("NEW"), icon: UserRoundSearch },
        { key: "CONTACTED" as const, label: "Contacted", value: total("CONTACTED"), icon: Clock3 },
        { key: "CLOSED" as const, label: "Closed", value: total("CLOSED"), icon: X },
      ]).map(card => {
        const Icon = card.icon;
        const active = filter === card.key;
        return <button key={card.key} type="button" onClick={() => { setFilter(card.key); setPage(1); }}
          aria-pressed={active}
          className={"flex min-h-[100px] flex-col items-start justify-between rounded-xl border p-4 text-left shadow-sm transition hover:border-blue-300 " +
            (active ? "border-blue-300 bg-blue-50/60 ring-1 ring-blue-100" : "border-slate-200 bg-white")}>
          <span className="flex w-full items-center justify-between gap-2 text-xs font-semibold text-slate-500">
            {card.label}<Icon size={17} className="text-blue-700"/>
          </span>
          <span className="mt-2 text-2xl font-extrabold tabular-nums text-slate-900">{card.value}</span>
        </button>;
      })}
    </section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <form className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-4 sm:p-5"
        onSubmit={event => { event.preventDefault(); setPage(1); setSearch(query.trim()); }}>
        <label className="min-w-[220px] flex-1 text-xs font-semibold text-slate-600">
          Find a prospect
          <div className="relative mt-1.5">
            <Search size={16} className="pointer-events-none absolute left-3 top-3 text-slate-400"/>
            <input className={input + " pl-9"} value={query} maxLength={80}
              onChange={event => setQuery(event.target.value)}
              placeholder="Reference, student name or mobile"/>
          </div>
        </label>
        <label className="w-full text-xs font-semibold text-slate-600 sm:w-44">
          Follow-up stage
          <select className={input + " mt-1.5"} value={filter}
            onChange={event => { setFilter(event.target.value as Filter); setPage(1); }}>
            <option value="ALL">All statuses</option>
            {statuses.map(status => <option key={status} value={status}>{names[status]}</option>)}
          </select>
        </label>
        <button type="submit" className="min-h-10 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800">Search</button>
        {(query || search || filter !== "ALL") && <button type="button" className={button} onClick={resetSearch}>Clear</button>}
      </form>

      {message && <p role="status" aria-live="polite" className="border-b border-slate-100 bg-blue-50 px-5 py-3 text-sm text-blue-900">{message}</p>}

      {loading ? <div className="p-8 text-sm text-slate-500">Loading enquiry register…</div> :
        items.length === 0 ? <div className="p-10 text-center">
          <UserRoundSearch size={30} className="mx-auto text-slate-300"/>
          <p className="mt-3 text-sm font-semibold text-slate-900">No enquiries found</p>
          <p className="mt-1 text-xs text-slate-500">Try another status or search term.</p>
        </div> :
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-bold">Prospect / reference</th>
                <th className="px-4 py-3 font-bold">Guardian contact</th>
                <th className="px-4 py-3 font-bold">Programme</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 text-right font-bold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map(item => {
                const draft = drafts[item.id] ?? { status: item.status, note: "" };
                const isOpen = expanded === item.id;
                const panelId = "followup-" + item.id;
                return <FragmentRow key={item.id}>
                  <tr className={isOpen ? "bg-blue-50/30" : "hover:bg-slate-50/70"}>
                    <td className="px-5 py-4 align-top">
                      <p className="text-sm font-bold text-slate-900">{item.student_name}</p>
                      <p className="mt-1 text-xs font-medium text-slate-500">{item.reference} · {item.class_name}</p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {new Date(item.submitted_at).toLocaleString("en-BD", { timeZone: "Asia/Dhaka" })}
                      </p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <p className="text-sm font-semibold text-slate-800">{item.guardian_name}</p>
                      <a href={"tel:" + item.mobile} className="mt-1 inline-block text-xs font-semibold text-blue-700 hover:underline">{item.mobile}</a>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <p className="max-w-[220px] text-sm text-slate-700">{item.programme || "General interest"}</p>
                      <p className="mt-1 text-xs text-slate-400">{item.intent}</p>
                    </td>
                    <td className="px-4 py-4 align-top"><StatusTag value={item.status}/></td>
                    <td className="px-4 py-4 text-right align-top">
                      <button type="button" aria-expanded={isOpen} aria-controls={panelId}
                        onClick={() => setExpanded(isOpen ? null : item.id)}
                        className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-blue-300 hover:text-blue-700">
                        {isOpen ? "Close" : "Review"} <ChevronDown size={14} className={isOpen ? "rotate-180" : ""}/>
                      </button>
                    </td>
                  </tr>
                  {isOpen && <tr id={panelId} className="bg-slate-50/70">
                    <td colSpan={5} className="border-t border-slate-200 px-5 py-5">
                      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">Registration details</h3>
                          <dl className="mt-3 grid grid-cols-[92px_1fr] gap-x-2 gap-y-2 text-xs">
                            <dt className="text-slate-500">School</dt><dd className="font-medium text-slate-800">{item.school_name || "Not provided"}</dd>
                            <dt className="text-slate-500">Area</dt><dd className="font-medium text-slate-800">{item.area || "Not provided"}</dd>
                            <dt className="text-slate-500">Class</dt><dd className="font-medium text-slate-800">{item.class_name}</dd>
                            <dt className="text-slate-500">Request</dt><dd className="font-medium text-slate-800">{item.intent}</dd>
                          </dl>
                        </div>
                        <div className="space-y-3">
                          <h3 className="text-sm font-bold text-slate-900">Follow-up action</h3>
                          <div className="grid gap-3 sm:grid-cols-[minmax(150px,1fr)_minmax(170px,1.8fr)]">
                            <label className="text-xs font-semibold text-slate-600">
                              Status
                              <select className={input + " mt-1.5"} value={draft.status}
                                onChange={event => setDrafts(prev => ({ ...prev, [item.id]: { ...draft, status: event.target.value as Status } }))}>
                                {statuses.map(value => <option key={value} value={value}>{names[value]}</option>)}
                              </select>
                            </label>
                            <label className="text-xs font-semibold text-slate-600">
                              Internal follow-up note
                              <textarea rows={2} className={input + " mt-1.5 min-h-[66px] resize-y"}
                                maxLength={1000} value={draft.note} placeholder="Call outcome or next action"
                                onChange={event => setDrafts(prev => ({ ...prev, [item.id]: { ...draft, note: event.target.value } }))}/>
                            </label>
                          </div>
                          <div className="flex flex-wrap items-center gap-3">
                            <button type="button" disabled={busy !== null || (draft.status === item.status && !draft.note.trim())}
                              onClick={() => void save(item)}
                              className="inline-flex min-h-10 items-center rounded-lg bg-blue-700 px-4 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50">
                              {busy === item.id ? "Saving…" : "Save follow-up"}
                            </button>
                            <button type="button" onClick={() => void toggleHistory(item.id)}
                              className="text-xs font-semibold text-blue-700 hover:underline">
                              {events[item.id] ? "Hide activity history" : "Show activity history"}
                            </button>
                          </div>
                          {events[item.id] && <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
                            <p className="mb-2 font-bold text-slate-900">Recorded actions</p>
                            {events[item.id].length === 0 ? <p>No actions recorded.</p> :
                              <div className="space-y-3">
                                {events[item.id].map((entry, idx) => <p key={idx} className="border-l-2 border-blue-200 pl-3 leading-5">
                                  <span className="font-bold text-slate-800">{entry.from_status} → {entry.to_status}</span>
                                  {" · "}{entry.actor_name}{" · "}{new Date(entry.occurred_at).toLocaleString("en-BD", {timeZone: "Asia/Dhaka"})}
                                  {entry.note && <span className="block">{entry.note}</span>}
                                </p>)}
                              </div>}
                          </div>}
                        </div>
                      </div>
                    </td>
                  </tr>}
                </FragmentRow>;
              })}
            </tbody>
          </table>
        </div>}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
        <p className="text-xs text-slate-500">Page {page} · Up to 25 enquiries per page</p>
        <div className="flex gap-2">
          <button type="button" disabled={loading || page <= 1} onClick={() => {setPage(p => p - 1); setExpanded(null);}}
            className={button}><ChevronLeft size={16}/> Previous</button>
          <button type="button" disabled={loading || !hasMore} onClick={() => {setPage(p => p + 1); setExpanded(null);}}
            className={button}>Next <ChevronRight size={16}/></button>
        </div>
      </div>
    </section>
    <p className="text-xs leading-5 text-slate-500">
      This CRM tracks unverified interest only. Status changes do not create admissions, seats, invoices or students.
    </p>
  </div>;
}

// Fragments keep each expanded review panel adjacent to its table row.
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
