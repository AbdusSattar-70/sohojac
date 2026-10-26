"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useLanguage } from "@/components/providers/language-provider";
import { AcknowledgementSlip } from "@/components/public/acknowledgement-slip";
import type { PublicOfferingCard } from "@/modules/offerings/types";

type Intent = "interest" | "admission";
type Confirmation = { reference: string; studentName: string; guardianName: string; mobile: string; intent: Intent; submitted: string };
const inputClass = "mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
const labelClass = "block text-sm font-medium";
const days = [["SAT","Saturday","শনিবার"],["SUN","Sunday","রবিবার"],["MON","Monday","সোমবার"],["TUE","Tuesday","মঙ্গলবার"],["WED","Wednesday","বুধবার"],["THU","Thursday","বৃহস্পতিবার"],["FRI","Friday","শুক্রবার"]] as const;
const classes = ["Class 8","Class 9","Class 10","Class 11","Class 12"];
const subjects = ["Bangla","English","Mathematics","General Science","Physics","Chemistry","Biology","Higher Mathematics","ICT"];
const offeringName = (o: PublicOfferingCard, bn: boolean) =>
  (bn ? o.showcase_title_bn : o.showcase_title) || o.showcase_title || o.name;

export function PublicInterestForm({ offerings, intent, initialOfferingId = "" }: {
  offerings: PublicOfferingCard[]; intent: Intent; initialOfferingId?: string;
}) {
  const { locale } = useLanguage();
  const bn = locale === "bn";
  const [offeringId, setOfferingId] = useState(initialOfferingId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const selected = offerings.find(o => o.id === offeringId);
  const available = intent === "interest" ? offerings : offerings.filter(o => o.is_accepting_applications);
  const canSubmit = intent === "interest" || available.length > 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !canSubmit) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const get = (field: string) => String(data.get(field) || "").trim();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent, offeringId: get("offeringId"), studentName: get("studentName"),
          studentNameBn: get("studentNameBn"), studentMobile: get("studentMobile"),
          studentEmail: get("studentEmail"), className: get("className"), schoolName: get("schoolName"),
          guardianName: get("guardianName"), guardianRelationship: get("guardianRelationship"),
          mobile: get("mobile"), alternateMobile: get("alternateMobile"), area: get("area"),
          subjectNames: data.getAll("subjectNames").map(String),
          preferredSchedule: get("preferredSchedule"),
          preferredDays: data.getAll("preferredDays").map(String),
          trialInterest: data.get("trialInterest") === "on",
          referralNote: get("referralNote"), notes: get("notes"),
          consent: data.get("consent") === "on", website: get("website"),
        }),
      });
      const result = await response.json() as { error?: string; ok?: boolean } & Partial<Confirmation>;
      if (!response.ok || !result.reference) {
        setError(result.error || (bn ? "ফর্ম জমা দেওয়া যায়নি। আবার চেষ্টা করুন।" : "Registration could not be submitted. Please try again."));
        return;
      }
      setConfirmation(result as Confirmation);
    } catch {
      setError(bn ? "সার্ভারে সংযোগ করা যাচ্ছে না। পরে চেষ্টা করুন।" : "Could not reach the service. Please try again.");
    } finally { setBusy(false); }
  }

  if (confirmation) {
    const submitted = new Date(confirmation.submitted).toLocaleString("en-BD", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" });
    return <section aria-live="polite" className="space-y-5">
      <div className="rounded-2xl border border-emerald-700/40 bg-emerald-500/10 p-5 text-sm text-emerald-200">
        <h2 className="text-lg font-bold">{bn ? "তথ্য গ্রহণ করা হয়েছে" : "Registration received"}</h2>
        <p className="mt-2">{bn ? "রেফারেন্স নম্বরটি সংরক্ষণ করুন। যাচাইয়ের পর একাডেমি যোগাযোগ করবে।" : "Keep your reference number. The academy will review your request and contact the guardian."}</p>
        <p className="mt-2 font-mono font-bold">{confirmation.reference}</p>
      </div>
      <AcknowledgementSlip bn={bn} message={{
        prospectNo: confirmation.reference,
        studentName: confirmation.studentName,
        intentLabel: confirmation.intent === "admission" ? "Admission application (unverified)" : "Interest registration",
        details: { guardian: confirmation.guardianName, mobile: confirmation.mobile, submitted, programme: selected ? offeringName(selected,bn) : "General enquiry" }
      }} />
      <div className="flex flex-wrap gap-3 print:hidden">
        <button type="button" onClick={() => window.print()} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white">{bn ? "প্রাপ্তি স্বীকারপত্র প্রিন্ট করুন" : "Print acknowledgement"}</button>
        <Link href="/" className="rounded-xl border px-5 py-3 text-sm">{bn ? "মূল পাতায় ফিরুন" : "Return home"}</Link>
      </div>
    </section>;
  }

  return <form onSubmit={submit} className="space-y-9">
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{bn ? "প্রোগ্রাম পছন্দ" : "Programme preference"}</h2>
      <label className={labelClass}>
        {bn ? "প্রোগ্রাম" : "Programme offering"} {intent === "admission" ? "*" : ""}
        <select name="offeringId" value={offeringId} onChange={e => setOfferingId(e.target.value)} required={intent === "admission"} className={inputClass}>
          <option value="">{bn ? "সাধারণ আগ্রহ / নির্বাচন করুন" : "General interest / Select an offering"}</option>
          {available.map(o => <option value={o.id} key={o.id}>{offeringName(o,bn)} · {o.class_name}</option>)}
        </select>
      </label>
      {intent === "admission" && !canSubmit && <div role="alert" className="rounded-xl border border-amber-700/30 bg-amber-600/10 p-4 text-sm">
        {bn ? "বর্তমানে কোনো প্রোগ্রামে ভর্তি আবেদন গ্রহণ করা হচ্ছে না।" : "No published programmes are currently accepting admission applications."}
        {" "}<Link className="underline" href="/interest">{bn ? "সাধারণ আগ্রহ নিবন্ধন করুন" : "Register general interest instead"}</Link>
      </div>}
      {selected && <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm leading-7">
        <p className="font-semibold">{offeringName(selected,bn)}</p>
        <p>{selected.public_schedule || (bn ? "ব্যাচের সময় পরে জানানো হবে" : "Batch schedule will be confirmed later")}</p>
        <p>{selected.current_open_seats > 0 ? `${selected.current_open_seats} ${bn ? "টি বর্তমান ব্যাচ আসন খালি" : "current batch seats open"}` : (bn ? "আসন/ব্যাচ নির্ধারণ স্টাফ যাচাই করবে" : "Staff will review batch placement")}</p>
        {selected.fee_plan?.components?.length ? <p>{bn ? "ফি বিস্তারিত" : "Published fees"}: {selected.fee_plan.components.map(c => `${c.name} BDT ${Number(c.amount).toLocaleString("en-BD")}`).join(" · ")}</p> : null}
        <p className="text-muted-foreground">{bn ? "ফর্ম জমা দিলেই ভর্তি বা আসন নিশ্চিত হয় না।" : "Submitting does not confirm admission or reserve a seat."}</p>
      </div>}
    </section>

    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{bn ? "শিক্ষার্থীর তথ্য" : "Student information"}</h2>
      <div className="grid gap-5 md:grid-cols-2">
        <label className={labelClass}>{bn ? "শিক্ষার্থীর নাম (ইংরেজি)" : "Student Name (English)"} *<input className={inputClass} name="studentName" maxLength={120} required autoComplete="name"/></label>
        <label className={labelClass}>{bn ? "শিক্ষার্থীর নাম (বাংলা)" : "Student Name (Bangla)"}<input className={inputClass} name="studentNameBn" maxLength={120}/></label>
        <label className={labelClass}>{bn ? "শিক্ষার্থীর মোবাইল (ঐচ্ছিক)" : "Student mobile (optional)"}<input className={inputClass} name="studentMobile" type="tel" inputMode="tel" pattern="01[3-9][0-9]{8}" maxLength={11}/></label>
        <label className={labelClass}>{bn ? "শিক্ষার্থীর ইমেইল (ঐচ্ছিক)" : "Student email (optional)"}<input className={inputClass} name="studentEmail" type="email" maxLength={180}/></label>
        <label className={labelClass}>{bn ? "বর্তমান ক্লাস" : "Current Class"} *<select className={inputClass} name="className" required defaultValue={selected?.class_name || ""}>
          <option value="">{bn ? "ক্লাস নির্বাচন করুন" : "Select class"}</option>
          {classes.map(item => <option key={item} value={item}>{item}</option>)}
        </select></label>
        <label className={labelClass}>{bn ? "বর্তমান স্কুল" : "Current school"}<input className={inputClass} name="schoolName" maxLength={160}/></label>
        <label className={labelClass+" md:col-span-2"}>{bn ? "এলাকা / লোকেশন" : "Area / Locality"}<input className={inputClass} name="area" maxLength={180}/></label>
      </div>
    </section>

    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{bn ? "অভিভাবক ও যোগাযোগ" : "Guardian & contact"}</h2>
      <div className="grid gap-5 md:grid-cols-2">
        <label className={labelClass}>{bn ? "অভিভাবকের নাম" : "Guardian name"} *<input className={inputClass} name="guardianName" maxLength={120} required/></label>
        <label className={labelClass}>{bn ? "সম্পর্ক" : "Relationship"}<select name="guardianRelationship" className={inputClass} defaultValue=""><option value="">{bn ? "নির্বাচন করুন" : "Select"}</option><option value="Father">{bn ? "পিতা" : "Father"}</option><option value="Mother">{bn ? "মাতা" : "Mother"}</option><option value="Other guardian">{bn ? "অন্যান্য অভিভাবক" : "Other guardian"}</option></select></label>
        <label className={labelClass}>{bn ? "প্রধান মোবাইল" : "Primary mobile"} *<input className={inputClass} name="mobile" type="tel" inputMode="numeric" pattern="01[3-9][0-9]{8}" maxLength={11} placeholder="01XXXXXXXXX" required/></label>
        <label className={labelClass}>{bn ? "বিকল্প মোবাইল" : "Alternate mobile"}<input className={inputClass} name="alternateMobile" type="tel" inputMode="numeric" pattern="01[3-9][0-9]{8}" maxLength={11}/></label>
      </div>
    </section>

    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{bn ? "কোন বিষয়ে আগ্রহী?" : "What are you interested in?"}</h2>
      <fieldset><legend className="text-sm font-semibold">{bn ? "বিষয়সমূহ" : "Subjects"}</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(selected?.subjects.length ? selected.subjects.map(s=>s.name) : subjects).map(subject =>
            <label key={subject} className="flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2.5 text-sm">
              <input type="checkbox" name="subjectNames" value={subject} className="size-4 accent-blue-600"/>
              {subject}
            </label>)}
        </div>
      </fieldset>
    </section>

    <section className="space-y-4">
      <h2 className="text-lg font-semibold">{bn ? "সময় ও ফলো-আপ পছন্দ" : "Schedule & follow-up"}</h2>
      <div className="grid gap-5 md:grid-cols-2">
        <label className={labelClass}>{bn ? "পছন্দের ক্লাস সময়" : "Preferred class time"}
          <select name="preferredSchedule" className={inputClass}><option value="">{bn ? "নির্বাচন করুন" : "No preference"}</option><option value="MORNING">{bn ? "সকাল" : "Morning"}</option><option value="AFTERNOON">{bn ? "বিকেল" : "Afternoon"}</option><option value="EVENING">{bn ? "সন্ধ্যা" : "Evening"}</option><option value="FLEXIBLE">{bn ? "যেকোনো সময়" : "Flexible"}</option></select>
        </label>
        <label className={labelClass}>{bn ? "রেফারেল তথ্য" : "Referral details"}<input name="referralNote" className={inputClass} maxLength={250}/></label>
      </div>
      <fieldset><legend className="text-sm font-semibold">{bn ? "পছন্দের দিন" : "Preferred days"}</legend>
        <div className="mt-3 flex flex-wrap gap-2">{days.map(([code,en,bnLabel]) =>
          <label key={code} className="flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm"><input type="checkbox" name="preferredDays" value={code} className="accent-blue-600"/>{bn ? bnLabel : en}</label>)}</div>
      </fieldset>
      <label className="flex items-center gap-3 rounded-xl border p-3 text-sm"><input type="checkbox" name="trialInterest"/>{bn ? "ট্রায়াল / ওরিয়েন্টেশন ক্লাসে আগ্রহী" : "Interested in a trial / orientation class"}</label>
      <label className={labelClass}>{bn ? "আর কিছু জানাতে চান?" : "Anything else?"}<textarea name="notes" className={inputClass+" min-h-24 py-3"} maxLength={1000} rows={3}/></label>
    </section>

    <div className="sr-only" aria-hidden="true"><label>Website <input name="website" tabIndex={-1} autoComplete="off" /></label></div>
    <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4 text-sm leading-6">
      <input type="checkbox" name="consent" required className="mt-1 size-4 accent-blue-600"/>
      <span>{bn ? "আমি শিক্ষার্থী ও অভিভাবকের তথ্য দিয়ে একাডেমির ফলো-আপের জন্য যোগাযোগে সম্মত হচ্ছি।" : "I consent to the academy using the student and guardian information to contact us about this enquiry."}{" "}
        <Link href="/privacy" target="_blank" className="underline underline-offset-2">{bn ? "গোপনীয়তা নীতি" : "Privacy notice"}</Link>
      </span>
    </label>
    {error && <p role="alert" className="rounded-xl border border-red-700/40 bg-red-800/10 p-4 text-sm text-red-300">{error}</p>}
    <button type="submit" disabled={busy || !canSubmit} className="min-h-12 w-full rounded-xl bg-blue-700 px-6 py-3 font-semibold text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50">
      {busy ? (bn ? "জমা হচ্ছে…" : "Submitting…") : intent === "admission" ? (bn ? "ভর্তির আবেদন জমা দিন" : "Submit admission application") : (bn ? "আগ্রহ নিবন্ধন জমা দিন" : "Submit interest registration")}
    </button>
    <p className="text-xs leading-6 text-muted-foreground">{bn ? "এই ফর্ম ভর্তি নিশ্চিতকরণ বা পেমেন্ট রসিদ নয়।" : "Submitting this form does not confirm admission, reserve a seat, or create a payment receipt."}</p>
  </form>;
}
