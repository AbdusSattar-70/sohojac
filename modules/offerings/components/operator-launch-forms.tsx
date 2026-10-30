"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createProgrammeOffering, publishFeePlan, updateProgrammeOfferingPublicControls } from "@/modules/offerings/actions";
import { runAcademicBatchCommand } from "@/modules/academics/batches/actions";
import type { OfferingOverview } from "@/modules/offerings/queries";
import type { UpdateOfferingPublicControlsInput } from "@/modules/offerings/schema";

type Offering = OfferingOverview["offerings"][number];
type Intent = { signature: string; id: string };
const inputClass =
  "mt-1 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
const primaryClass =
  "min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50";
const money = /^\d{1,9}(?:\.\d{1,2})?$/;
const slug = (value: string, size: number) =>
  value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, size) || "NEW";
function intentFor(previous: Intent | null, signature: string): Intent {
  return previous?.signature === signature
    ? previous
    : { signature, id: crypto.randomUUID() };
}
function Feedback({ message }: { message: { ok: boolean; text: string } | null }) {
  return message ? (
    <p role={message.ok ? "status" : "alert"}
      className={`rounded-xl border p-3 text-sm ${message.ok ? "border-border bg-muted" : "border-destructive/50 text-destructive"}`}>
      {message.text}
    </p>
  ) : null;
}

/** A minimal coaching-centre programme draft; internal codes and reasons are generated.
 * The old detailed editor stays available for specialized training contexts.
 */
export function OperatorProgrammeForm({
  data, onCreated,
}: {
  data: OfferingOverview;
  onCreated: (id: string) => void;
}) {
  const [branchId, setBranch] = useState(data.branches.length === 1 ? data.branches[0].id : "");
  const [yearId, setYear] = useState(data.years.find((y) => y.is_active)?.id ?? "");
  const [classId, setClass] = useState("");
  const [programId, setProgram] = useState("");
  const [groupId, setGroup] = useState("");
  const [name, setName] = useState("");
  const [codeSuffix] = useState(() => crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase());
  const request = useRef<Intent | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const programme = data.programs.find((x) => x.id === programId);
  const yr = data.years.find((x) => x.id === yearId);
  const grade = data.classes.find((x) => x.id === classId);
  const branch = data.branches.find((x) => x.id === branchId);
  const code = [
    slug(programme?.code ?? "COACH", 9),
    slug(grade?.code ?? "CLASS", 8),
    slug(yr?.code ?? "YEAR", 6),
    codeSuffix,
  ].join("-").slice(0, 40);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!branchId || !programId || !yearId || !classId) {
      setMessage({ ok: false, text: "Choose a programme, class, academic year and campus before saving." });
      return;
    }
    const entry = {
      branchId, programId, academicYearId: yearId, classId, groupId,
      operationKind: "COACHING" as const, teachingStartsOn: "", teachingEndsOn: "",
      code, name: name.trim(),
      reason: "Created coaching programme intake through guided launch",
    };
    const signature = JSON.stringify(entry);
    request.current = intentFor(request.current, signature);
    const payload = { ...entry, requestId: request.current.id };
    setMessage(null);
    start(async () => {
      const result = await createProgrammeOffering(payload).catch(() => ({
        ok: false as const, error: "Could not confirm the result. Retry without changing the form to recover the same request.",
      }));
      if (!result.ok) {
        setMessage({ ok: false, text: result.error });
        return;
      }
      request.current = null;
      setMessage({ ok: true, text: "Programme draft created. Continue with its standard fees." });
      onCreated(result.reference);
    });
  };
  return (
    <form onSubmit={submit} className="space-y-5" data-editor data-busy={pending ? "true" : "false"}>
      <fieldset disabled={pending} className="contents">
        <p className="text-sm text-muted-foreground">
          Set up an ordinary coaching programme. The system generates its internal code and keeps the draft private until you publish it.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">Programme
            <select required value={programId} onChange={(e) => setProgram(e.target.value)} className={inputClass}>
              <option value="">Select a programme</option>
              {data.programs.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">Class
            <select required value={classId} onChange={(e) => setClass(e.target.value)} className={inputClass}>
              <option value="">Select a class</option>
              {data.classes.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">Academic year
            <select required value={yearId} onChange={(e) => setYear(e.target.value)} className={inputClass}>
              <option value="">Select an academic year</option>
              {data.years.map((row) => <option key={row.id} value={row.id}>{row.name}{row.is_active ? " · Active" : ""}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">Campus
            <select required value={branchId} onChange={(e) => setBranch(e.target.value)} className={inputClass}>
              <option value="">Select a campus</option>
              {data.branches.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">Academic group (optional)
            <select value={groupId} onChange={(e) => setGroup(e.target.value)} className={inputClass}>
              <option value="">All groups</option>
              {data.groups.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">Display name (optional)
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass}
              placeholder={programme?.name ?? "Uses selected programme name"} maxLength={160}/>
          </label>
        </div>
        <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          Internal reference: <span className="font-mono text-foreground">{code}</span>.
          For special training or nonstandard details, use the advanced offering register.
          {branch && grade && yr ? ` · ${branch.name} / ${grade.name} / ${yr.name}` : ""}
        </p>
        <Feedback message={message}/>
        <button type="submit" disabled={pending} className={primaryClass}>
          {pending ? "Creating…" : "Save programme draft"}
        </button>
      </fieldset>
    </form>
  );
}

/** Basic fees are an intentionally narrow path; unusual billing cycles use the
 * protected advanced Fee Plan editor. A successful write still uses the full
 * audited, version-checked, balanced domain command.
 */
export function OperatorFeeForm({
  offering, today, onSaved,
}: {
  offering: Offering; today: string; onSaved: () => void;
}) {
  const router = useRouter();
  const [tuition, setTuition] = useState("");
  const [admissionFee, setAdmissionFee] = useState("0");
  const [dueDay, setDueDay] = useState("10");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const request = useRef<Intent | null>(null);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!money.test(tuition) || Number(tuition) <= 0 || !money.test(admissionFee) ||
        !Number.isInteger(Number(dueDay)) || Number(dueDay) < 1 || Number(dueDay) > 28) {
      setMessage({ ok: false, text: "Enter valid tuition and admission amounts (up to two decimal places) and a due day from 1–28." });
      return;
    }
    const entry = {
      offeringId: offering.id, expectedVersion: offering.version,
      billingCycle: "MONTHLY" as const, dueDay: Number(dueDay), effectiveFrom: today,
      reason: "Published approved standard coaching fees during programme launch",
      components: [
        { code: "TUITION", name: "Monthly tuition", amount: Number(tuition), chargeType: "TUITION" as const, recurrence: "PER_CYCLE" as const },
        ...(Number(admissionFee) > 0 ? [{ code: "ADMISSION", name: "One-time admission fee", amount: Number(admissionFee), chargeType: "ADMISSION" as const, recurrence: "ONE_TIME" as const }] : []),
      ],
    };
    const signature = JSON.stringify(entry);
    request.current = intentFor(request.current, signature);
    setMessage(null);
    start(async () => {
      const result = await publishFeePlan({ ...entry, requestId: request.current!.id }).catch(() => ({
        ok: false as const, error: "Fee save result is uncertain. Retry unchanged values to recover it safely.",
      }));
      if (!result.ok) {
        setMessage({ ok: false, text: result.error });
        return;
      }
      request.current = null;
      setMessage({ ok: true, text: "Standard fees published. Existing student charges are not modified." });
      router.refresh();
      onSaved();
    });
  };
  return (
    <form onSubmit={submit} className="space-y-4" data-editor data-busy={pending ? "true" : "false"}>
      <fieldset disabled={pending} className="contents">
        <p className="text-sm text-muted-foreground">
          Set the monthly tuition and any one-time admission fee. These terms become the approved billing basis for future admissions.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm font-medium">Monthly tuition (BDT)
            <input required type="text" inputMode="decimal" value={tuition} onChange={(e) => setTuition(e.target.value)}
              placeholder="2500.00" className={inputClass}/>
          </label>
          <label className="text-sm font-medium">Admission fee (BDT)
            <input required type="text" inputMode="decimal" value={admissionFee} onChange={(e) => setAdmissionFee(e.target.value)}
              className={inputClass}/>
          </label>
          <label className="text-sm font-medium">Monthly due day
            <input required type="number" min={1} max={28} value={dueDay} onChange={(e) => setDueDay(e.target.value)}
              className={inputClass}/>
          </label>
        </div>
        <p className="text-xs text-muted-foreground">Effective today ({today}, Dhaka time). Custom components, term billing and discounts remain in Advanced Fee Plans.</p>
        <Feedback message={message}/>
        <button disabled={pending} type="submit" className={primaryClass}>{pending ? "Publishing…" : "Approve and publish fees"}</button>
      </fieldset>
    </form>
  );
}

export function OperatorBatchForm({
  offering, capacityLimit, onSaved,
}: {
  offering: Offering; capacityLimit: number; onSaved: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [codeSuffix, setCodeSuffix] = useState(() => crypto.randomUUID().replaceAll("-", "").slice(0, 5).toUpperCase());
  const [capacity, setCapacity] = useState(String(Math.min(12, capacityLimit)));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const request = useRef<Intent | null>(null);
  const code = `${slug(offering.code, 24)}-${codeSuffix}`.slice(0, 40);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim() || name.trim().length < 2 ||
        !Number.isInteger(Number(capacity)) || Number(capacity) < 1 || Number(capacity) > Math.min(12, capacityLimit)) {
      setMessage({ ok: false, text: `Enter a batch name and capacity from 1 to ${Math.min(12, capacityLimit)}.` });
      return;
    }
    const entry = {
      action: "CREATE_BATCH" as const, offeringId: offering.id,
      code, name: name.trim(), capacity: Number(capacity),
      reason: "Opened a teaching batch through guided programme launch",
    };
    const signature = JSON.stringify(entry);
    request.current = intentFor(request.current, signature);
    setMessage(null);
    start(async () => {
      const result = await runAcademicBatchCommand({ ...entry, requestId: request.current!.id }).catch(() => ({
        ok: false as const, message: "Could not confirm batch creation. Retry unchanged entries to recover the request.",
      }));
      if (!result.ok) {
        setMessage({ ok: false, text: result.message });
        return;
      }
      request.current = null;
      setName("");
      setCodeSuffix(crypto.randomUUID().replaceAll("-", "").slice(0, 5).toUpperCase());
      setMessage({ ok: true, text: "Batch created as planned. Activate it below before accepting students." });
      router.refresh();
      onSaved();
    });
  };
  return (
    <form onSubmit={submit} className="space-y-4" data-editor data-busy={pending ? "true" : "false"}>
      <fieldset disabled={pending} className="contents">
        <p className="text-sm text-muted-foreground">Create a small teaching cohort. The 12-seat limit is enforced again by the server.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">Batch name
            <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass}
              placeholder={offering.name + " · Batch A"} maxLength={160}/>
          </label>
          <label className="text-sm font-medium">Maximum students
            <input required type="number" min={1} max={Math.min(12, capacityLimit)} value={capacity}
              onChange={(e) => setCapacity(e.target.value)} className={inputClass}/>
          </label>
        </div>
        <p className="text-xs text-muted-foreground">Batch code: <span className="font-mono">{code}</span>. Batches start as planned; activate the saved batch below.</p>
        <Feedback message={message}/>
        <button disabled={pending} type="submit" className={primaryClass}>{pending ? "Creating…" : "Create planned batch"}</button>
      </fieldset>
    </form>
  );
}

/** Small, controlled public launch editor. Keeps every advanced field and
 * existing subject link unchanged, so the guided UI never destroys them.
 */
export function OperatorPublicationForm({
  offering, linkedSubjectIds, seatsAvailable, feeReady, onSaved,
}: {
  offering: Offering;
  linkedSubjectIds: string[];
  seatsAvailable: number;
  feeReady: boolean;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(offering.showcase_title ?? offering.name);
  const [description, setDescription] = useState(offering.showcase_description ?? "");
  const [visible, setVisible] = useState(offering.is_website_visible);
  const [accepting, setAccepting] = useState(offering.is_accepting_applications);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const request = useRef<Intent | null>(null);
  const canOpen = feeReady && offering.status === "ACTIVE" && seatsAvailable > 0;
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (visible && (!title.trim() || !description.trim())) {
      setMessage({ ok: false, text: "The published website card needs a clear title and description." });
      return;
    }
    if (accepting && (!visible || !canOpen)) {
      setMessage({ ok: false, text: "To open applications, first publish the card, approve fees, and activate a batch with available seats." });
      return;
    }
    const entry: Omit<UpdateOfferingPublicControlsInput, "requestId"> = {
      offeringId: offering.id, expectedVersion: offering.version,
      showcaseTitle: title.trim(), showcaseTitleBn: offering.showcase_title_bn ?? "",
      showcaseDescription: description.trim(), showcaseDescriptionBn: offering.showcase_description_bn ?? "",
      showcaseEyebrow: offering.showcase_eyebrow ?? "", showcaseEyebrowBn: offering.showcase_eyebrow_bn ?? "",
      publicSchedule: offering.public_schedule ?? "", publicScheduleBn: offering.public_schedule_bn ?? "",
      publicRequirements: offering.public_requirements ?? "", publicRequirementsBn: offering.public_requirements_bn ?? "",
      admissionPolicy: offering.admission_policy ?? "", admissionPolicyBn: offering.admission_policy_bn ?? "",
      showcaseIcon: (offering.showcase_icon as UpdateOfferingPublicControlsInput["showcaseIcon"]) ?? "",
      showcaseSortOrder: offering.showcase_sort_order ?? 100,
      isWebsiteVisible: visible, isAcceptingApplications: accepting,
      applicationsOpenOn: offering.applications_open_on ?? "",
      applicationsCloseOn: offering.applications_close_on ?? "",
      subjectIds: linkedSubjectIds,
      reason: "Updated website publication after guided programme launch review",
    };
    const signature = JSON.stringify(entry);
    request.current = intentFor(request.current, signature);
    setMessage(null);
    start(async () => {
      const result = await updateProgrammeOfferingPublicControls({
        ...entry, requestId: request.current!.id,
      }).catch(() => ({
        ok: false as const, error: "Publication outcome is uncertain. Retry unchanged entries to check the original request.",
      }));
      if (!result.ok) {
        setMessage({ ok: false, text: result.error });
        return;
      }
      request.current = null;
      setMessage({ ok: true, text: "Website settings saved. Confirm the live page and application status below." });
      router.refresh();
      onSaved();
    });
  };
  return (
    <form onSubmit={submit} className="space-y-4" data-editor data-busy={pending ? "true" : "false"}>
      <fieldset disabled={pending} className="contents">
        <div className="grid gap-4">
          <label className="text-sm font-medium">Public programme title
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} required maxLength={120}/>
          </label>
          <label className="text-sm font-medium">Brief description for parents
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass + " py-3"}
              rows={3} required maxLength={400} placeholder="Who this programme is for and what students will learn"/>
          </label>
        </div>
        <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-4">
          <label className="flex min-h-10 items-center gap-3 text-sm font-medium">
            <input type="checkbox" checked={visible} onChange={(e) => {
              setVisible(e.target.checked);
              if (!e.target.checked) setAccepting(false);
            }} className="size-4" disabled={offering.status !== "ACTIVE" && !visible}/>
            Show programme on public website
          </label>
          <label className="flex min-h-10 items-center gap-3 text-sm font-medium">
            <input type="checkbox" checked={accepting} onChange={(e) => setAccepting(e.target.checked)}
              className="size-4" disabled={!visible || (!canOpen && !accepting)}/>
            Accept applications for this programme
          </label>
          {!canOpen && <p className="text-xs text-muted-foreground">
            Applications cannot be opened from this guided screen until current fees and a batch with free seats exist.
          </p>}
        </div>
        <p className="text-xs text-muted-foreground">
          Existing Bengali translations, detailed policy, schedule, subject links and application dates stay unchanged.
          Advanced website settings remain available in the offering register.
        </p>
        <Feedback message={message}/>
        <button disabled={pending} type="submit" className={primaryClass}>{pending ? "Saving…" : "Save website and application settings"}</button>
      </fieldset>
    </form>
  );
}
