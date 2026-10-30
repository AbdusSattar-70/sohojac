"use client";

import Link from "next/link";
import { useState } from "react";
import type { OfferingOverview } from "@/modules/offerings/queries";
import type { AdmissionWorkspace } from "@/modules/admissions/schema";
import {
  getProgrammeLaunchReadiness, type LaunchStage,
} from "@/modules/offerings/programme-launch-readiness";
import {
  OperatorProgrammeForm, OperatorFeeForm, OperatorBatchForm, OperatorPublicationForm,
} from "./operator-launch-forms";
import { RecordStateButton } from "@/modules/academics/batches/state-button";

const STEPS: { id: LaunchStage; label: string; description: string }[] = [
  { id: "PROGRAMME", label: "Programme", description: "Who and where" },
  { id: "FEES", label: "Fees", description: "Standard charges" },
  { id: "BATCHES", label: "Batches", description: "Available seats" },
  { id: "WEBSITE", label: "Website", description: "Parent-facing details" },
  { id: "REVIEW", label: "Review", description: "Ready to launch?" },
];

const secondaryButton =
  "inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const primaryButton =
  "inline-flex min-h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function label(values: { id: string; name: string }[], id: string | null) {
  return values.find((value) => value.id === id)?.name ?? "Not set";
}
function Badge({ done, text }: { done: boolean; text: string }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${done
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      : "border-border bg-muted text-muted-foreground"}`}>
      {text}
    </span>
  );
}

export function ProgrammeLaunchWorkspace({
  data, batches, initialOfferingId, today, canManage, canBill, canViewFees,
}: {
  data: OfferingOverview;
  batches: AdmissionWorkspace;
  initialOfferingId?: string;
  today: string;
  canManage: boolean;
  canBill: boolean;
  canViewFees: boolean;
}) {
  const [selectedId, setSelectedId] = useState(() =>
    data.offerings.some((x) => x.id === initialOfferingId)
      ? initialOfferingId!
      : (data.offerings.find((x) => x.status !== "RETIRED")?.id ?? "")
  );
  const [stage, setStage] = useState<LaunchStage>("PROGRAMME");
  const [creating, setCreating] = useState(() => data.offerings.length === 0);
  const [notification, setNotification] = useState("");
  const selected = data.offerings.find((x) => x.id === selectedId);
  const linkedSubjectIds = selected
    ? data.offeringSubjects.filter((row) => row.offering_id === selected.id)
      .sort((a,b) => a.sort_order - b.sort_order).map((row) => row.subject_id)
    : [];
  const feeReady = Boolean(selected && batches.offerings.find((o) => o.id === selected.id)?.feeReady);
  const readiness = selected
    ? getProgrammeLaunchReadiness(selected, batches.batches, feeReady, today)
    : null;
  const activePlan = selected && canViewFees
    ? data.plans.find((plan) => plan.offering_id === selected.id && plan.status === "ACTIVE")
    : null;
  const selectedBatches = selected
    ? batches.batches.filter((batch) => batch.offeringId === selected.id)
    : [];
  const [showFeeEditor, setShowFeeEditor] = useState(false);
  const select = (id: string) => {
    setSelectedId(id);
    setCreating(false);
    setShowFeeEditor(false);
    setNotification("");
    setStage("PROGRAMME");
  };
  const completed = readiness?.completed ?? [false, false, false, false];

  return (
    <div className="space-y-6" data-operator-programme-launch>
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            <label htmlFor="launch-offering" className="block text-sm font-semibold">
              Working on
            </label>
            <select id="launch-offering" value={selectedId}
              onChange={(event) => select(event.target.value)}
              className="mt-2 min-h-12 w-full max-w-xl rounded-xl border border-input bg-background px-3 text-sm text-foreground">
              <option value="">Select a programme</option>
              {data.offerings.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} · {row.class_name || "All classes"} · {row.academic_year_name || "No year"} · {row.status.toLowerCase()}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              A programme may be saved as a draft. Fee publication activates it internally; the website and applications remain separately controlled.
            </p>
          </div>
          {canManage && (
            <button type="button" onClick={() => { setCreating(true); setStage("PROGRAMME"); setNotification(""); }}
              className={secondaryButton}>
              + New coaching programme
            </button>
          )}
        </div>
        {selected && !creating && readiness && (
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4 text-sm">
            <Badge done={readiness.feeReady} text={readiness.feeReady ? "Fee plan ready" : "Fees needed"}/>
            <Badge done={readiness.openSeats > 0} text={`${readiness.openSeats} open seats`}/>
            <Badge done={readiness.websiteVisible} text={readiness.websiteVisible ? "Website visible" : "Website hidden"}/>
            <Badge done={readiness.applicationsOpen} text={readiness.applicationsOpen ? "Applications open" : "Applications closed"}/>
          </div>
        )}
      </section>
      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Programme launch steps" className="h-fit rounded-2xl border border-border bg-card p-3">
          <ol className="space-y-1">
            {STEPS.map((item, index) => {
              const done = index < 4 && completed[index];
              const current = stage === item.id;
              return (
                <li key={item.id}>
                  <button type="button" aria-current={current ? "step" : undefined}
                    onClick={() => { setStage(item.id); if (item.id !== "PROGRAMME") setCreating(false); }}
                    className={`flex min-h-14 w-full items-center gap-3 rounded-xl p-3 text-left transition-colors
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                      ${current ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-muted"}`}>
                    <span className={`flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold
                      ${done ? "border-emerald-500/40 text-emerald-300" : "border-border text-muted-foreground"}`}>
                      {done ? "✓" : index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{item.label}</span>
                      <span className="block text-xs text-muted-foreground">{item.description}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
        <section aria-live="polite" className="min-w-0 space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
          {notification && <p role="status" className="rounded-xl border border-border bg-muted p-3 text-sm">{notification}</p>}

          {stage === "PROGRAMME" && (
            <>
              <div>
                <h2 className="text-xl font-semibold">1. Choose a programme</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  A draft defines the programme, class, year and campus. No guardian sees a draft.
                </p>
              </div>
              {creating ? (
                canManage ? (
                  data.programs.length && data.classes.length && data.years.length && data.branches.length ? (
                    <OperatorProgrammeForm data={data} onCreated={(id) => {
                      setSelectedId(id);
                      setCreating(false);
                      setStage("FEES");
                      setNotification("Draft created. Next, approve standard fees.");
                    }}/>
                  ) : (
                    <div className="space-y-3 rounded-xl border border-amber-500/30 p-4">
                      <p className="text-sm">Academic reference setup is incomplete. Add an active campus, programme, class and year first.</p>
                      <Link href="/dashboard/academics/settings" className={secondaryButton}>Open Academic Setup</Link>
                    </div>
                  )
                ) : <p className="text-sm text-muted-foreground">You need programme management permission to create a draft.</p>
              ) : selected ? (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">{selected.name}</h3>
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div><dt className="text-muted-foreground">Programme</dt><dd className="font-medium">{label(data.programs,selected.program_id)}</dd></div>
                    <div><dt className="text-muted-foreground">Class</dt><dd className="font-medium">{label(data.classes,selected.class_id)}</dd></div>
                    <div><dt className="text-muted-foreground">Academic year</dt><dd className="font-medium">{label(data.years,selected.academic_year_id)}</dd></div>
                    <div><dt className="text-muted-foreground">Campus</dt><dd className="font-medium">{label(data.branches,selected.branch_id)}</dd></div>
                    <div><dt className="text-muted-foreground">Status</dt><dd className="font-medium">{selected.status}</dd></div>
                    <div><dt className="text-muted-foreground">Reference</dt><dd className="font-mono text-xs">{selected.code}</dd></div>
                  </dl>
                  <div className="flex flex-wrap gap-3">
                    {selected.status !== "RETIRED" && <button className={primaryButton} type="button" onClick={() => setStage("FEES")}>Continue to fees</button>}
                    {canManage && <Link className={secondaryButton} href="/dashboard/academics/offerings">Edit advanced details</Link>}
                  </div>
                  {selected.status === "RETIRED" && <p role="alert" className="rounded-xl border border-amber-500/40 p-3 text-sm">
                    Retired programmes cannot be launched. Review their state in the advanced register.
                  </p>}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Choose a programme above, or create the first draft.</p>
                  {canManage && <button className={primaryButton} onClick={() => setCreating(true)} type="button">Create a programme</button>}
                </div>
              )}
            </>
          )}

          {stage === "FEES" && (
            <>
              <div>
                <h2 className="text-xl font-semibold">2. Approve standard fees</h2>
                <p className="mt-1 text-sm text-muted-foreground">A published fee plan is required before a teaching batch can open. Already-issued student bills never change automatically.</p>
              </div>
              {!selected ? <p className="text-sm">Choose a programme first.</p> :
                selected.status === "RETIRED" ? <p className="text-sm">Reactivate the programme before approving new fees.</p> :
                feeReady && !showFeeEditor ? (
                  <div className="space-y-4">
                    <Badge done text="Current fees are ready"/>
                    {canViewFees && activePlan && (
                      <ul className="grid gap-2 sm:grid-cols-2">
                        {data.components.filter(x=>x.fee_plan_version_id===activePlan.id).map(x=> (
                          <li key={x.id} className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
                            <span>{x.name}</span>
                            <strong className="float-right tabular-nums">{Number(x.amount).toLocaleString("en-BD",{minimumFractionDigits:2})} BDT</strong>
                            <span className="mt-1 block text-xs text-muted-foreground">{x.recurrence==="PER_CYCLE"?"Per billing cycle":"One time"}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="flex flex-wrap gap-3">
                      <button type="button" className={primaryButton} onClick={() => setStage("BATCHES")}>Continue to batches</button>
                      {canBill && <button type="button" className={secondaryButton} onClick={() => setShowFeeEditor(true)}>Change standard fees</button>}
                    </div>
                  </div>
                ) : canBill ? (
                  <div className="space-y-4">
                    {feeReady && <p role="alert" className="rounded-xl border border-amber-500/40 p-3 text-sm">
                      Changing approved fees creates a new version. Existing admissions and posted invoices retain their original amounts.
                    </p>}
                    <OperatorFeeForm key={selected.id + ":" + selected.version} offering={selected} today={today}
                      onSaved={() => {setShowFeeEditor(false);setStage("BATCHES");setNotification("Fees approved. Create and activate a 12-seat batch.");}}/>
                    <Link className={secondaryButton} href={`/dashboard/finance/fee-plans?offering=${encodeURIComponent(selected.id)}`}>
                      Advanced Fee Plan and discounts
                    </Link>
                  </div>
                ) : (
                  <p className="rounded-xl border p-4 text-sm">An authorized finance manager must approve the fees before you can continue.</p>
                )
              }
            </>
          )}

          {stage === "BATCHES" && (
            <>
              <div>
                <h2 className="text-xl font-semibold">3. Open teaching seats</h2>
                <p className="mt-1 text-sm text-muted-foreground">Create a batch, then activate it. Each batch may hold at most 12 active students.</p>
              </div>
              {!selected ? <p className="text-sm">Choose a programme first.</p> : (
                <div className="space-y-5">
                  {selectedBatches.length > 0 && <div className="space-y-3">
                    {selectedBatches.map(batch => (
                      <article key={batch.id} className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:flex-row sm:items-center">
                        <div className="min-w-0 space-y-1">
                          <h3 className="font-semibold">{batch.name}</h3>
                          <p className="text-xs text-muted-foreground">{batch.code} · {batch.occupied}/{batch.capacity} students · {batch.isActive ? "Active" : "Planned"}</p>
                        </div>
                        {canManage && <RecordStateButton entity="batch" id={batch.id} active={batch.isActive} expectedVersion={batch.version}/>}
                      </article>
                    ))}
                  </div>}
                  {!feeReady ? (
                    <div className="space-y-3 rounded-xl border border-amber-500/40 p-4 text-sm">
                      <p>Publish current standard fees before creating or activating a batch.</p>
                      <button type="button" className={secondaryButton} onClick={() => setStage("FEES")}>Return to fees</button>
                    </div>
                  ) : canManage ? (
                    <OperatorBatchForm key={selected.id} offering={selected} capacityLimit={batches.capacityLimit ?? 12}
                      onSaved={() => setNotification("Batch saved. Activate the planned batch to make seats available.")}/>
                  ) : <p className="text-sm">Programme management permission is required to create or activate batches.</p>}
                  {readiness && readiness.openSeats > 0 && (
                    <button type="button" className={primaryButton} onClick={() => setStage("WEBSITE")}>
                      Continue to website settings · {readiness.openSeats} seats available
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {stage === "WEBSITE" && (
            <>
              <div>
                <h2 className="text-xl font-semibold">4. Publish for parents</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Keep public copy short. Advanced translations and curriculum are managed separately. The website and application switches remain audited.
                </p>
              </div>
              {!selected ? <p className="text-sm">Choose a programme first.</p> :
                !feeReady ? <div className="space-y-3">
                  <p className="text-sm">Standard fees are not ready yet. The website cannot publish a draft.</p>
                  <button type="button" className={secondaryButton} onClick={() => setStage("FEES")}>Approve fees first</button>
                </div> : !canManage ? <p className="text-sm">Programme management permission is required to publish.</p> : (
                  <div className="space-y-4">
                    <OperatorPublicationForm key={selected.id + ":" + selected.version} offering={selected}
                      linkedSubjectIds={linkedSubjectIds} seatsAvailable={readiness?.openSeats ?? 0}
                      feeReady={feeReady} onSaved={() => {
                        setStage("REVIEW");
                        setNotification("Website settings saved. Confirm that the programme is publicly available.");
                      }}/>
                    <Link className={secondaryButton} href="/dashboard/academics/offerings">Advanced website settings</Link>
                  </div>
                )}
            </>
          )}

          {stage === "REVIEW" && (
            <>
              <div>
                <h2 className="text-xl font-semibold">5. Final readiness review</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Only programmes with effective fees, an active batch with free seats, a visible card and open intake are marked ready.
                </p>
              </div>
              {!selected || !readiness ? <p className="text-sm">Choose a programme first.</p> : (
                <div className="space-y-5">
                  <div className={`rounded-xl border p-4 ${readiness.publishReady
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : "border-border bg-muted/30"}`}>
                    <p className="font-semibold">{readiness.publishReady ? "Ready for applications" : "Setup not yet complete"}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {readiness.publishReady
                        ? `${selected.name} has ${readiness.openSeats} open seats and is ready to receive public applications.`
                        : "Complete the outstanding items before advertising open admission."}
                    </p>
                  </div>
                  {readiness.blockers.length > 0 && (
                    <ul className="space-y-2 text-sm">
                      {readiness.blockers.map((blocker) => <li key={blocker} className="flex gap-2"><span aria-hidden="true">•</span><span>{blocker}</span></li>)}
                    </ul>
                  )}
                  <div className="flex flex-wrap gap-3">
                    {readiness.publishReady ? (
                      <>
                        <Link href="/" target="_blank" rel="noopener noreferrer" className={primaryButton}>Verify live public website</Link>
                        <Link href={`/interest?intent=admission&offering=${encodeURIComponent(selected.id)}`}
                          target="_blank" rel="noopener noreferrer" className={secondaryButton}>Inspect admission interest form</Link>
                      </>
                    ) : (
                      <button type="button" className={primaryButton} onClick={() => setStage(readiness.stage)}>Continue required setup</button>
                    )}
                    <Link className={secondaryButton} href="/dashboard/academics/offerings">Advanced offering register</Link>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
