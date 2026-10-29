import Link from "next/link";
import {notFound} from "next/navigation";
import {z} from "zod";
import {PageHeader} from "@/components/erp/page-header";
import {StatusBadge} from "@/components/erp/status-badge";
import {requirePermission} from "@/modules/platform/auth/erp-context";
import {getAdmissionCase,getAdmissionWorkspace} from "@/modules/admissions/queries";
import {getAdmissionReviewData} from "@/modules/admissions/lifecycle";
import {AdmissionCommandForm} from "@/modules/admissions/components/command-form";
import {AdmissionIdentityEditor} from "@/modules/admissions/components/identity-editor";
import {AdmissionPlacementEditor} from "@/modules/admissions/components/placement-editor";
import {ReferralForm} from "@/modules/admissions/components/referral-form";
import {PhysicalConsentForm} from "@/modules/admissions/components/physical-consent-form";
import {ExtraChargeForm} from "@/modules/admissions/components/extra-charge-form";
import {AdmissionDiscountForm} from "@/modules/admissions/components/discount-form";
import {FinalSubmissionReview} from "@/modules/admissions/components/final-submission-review";
import {AdmissionCollectionForm} from "@/modules/admissions/components/collection-form";
import {CaseStepNavigation} from "@/modules/admissions/components/case-step-navigation";

const labels:Record<string,string>={
 DIRECT_STAFF:"Direct admission",PROSPECT_CONVERSION:"Enquiry conversion",
 PUBLIC_APPLICATION:"Public application",EXISTING_STUDENT:"Existing student"
};
export const dynamic="force-dynamic";
export default async function AdmissionCasePage({params}:{params:Promise<{admissionId:string}>}){
 const context=await requirePermission("admissions.view");
 const {admissionId}=await params;
 if(!z.string().uuid().safeParse(admissionId).success)notFound();
 const [a,data,review]=await Promise.all([
  getAdmissionCase(admissionId),getAdmissionWorkspace(),getAdmissionReviewData(admissionId)
 ]);
 const manage=context.permissions.includes("admissions.create")||context.permissions.includes("admissions.manage");
 const canBill=context.permissions.includes("finance.billing.manage");
 const canPay=context.permissions.includes("finance.payments.post");
 const closed=["CANCELLED","CLOSED_ENROLLMENT"].includes(a.status);
 const finalized=["BILLING_POSTED","PENDING_PAYMENT","ACTIVE_ENROLLMENT","CLOSED_ENROLLMENT"].includes(a.status);
 const accepted=finalized||a.status==="ACCEPTED";
 const hasReferral=Boolean(review.referral),hasConsent=review.hasConsent;
 const totalBeforeDiscount=review.estimate.tuition+review.estimate.admission+review.estimate.extra;
 const steps=[
  {id:"verify",title:"Verify application and placement",
   complete:a.status!=="DRAFT",active:a.status==="DRAFT"},
  {id:"source",title:"Record Organic or referrer",
   complete:hasReferral,active:a.status==="READY"&&!hasReferral},
  {id:"consent",title:"Receive signed paper consent",
   complete:hasConsent,active:a.status==="READY"&&hasReferral&&!hasConsent},
  {id:"submit",title:"Review fees and confirm admission",
   complete:finalized,active:(a.status==="READY"&&hasReferral&&hasConsent)||a.status==="ACCEPTED"},
  {id:"enroll",title:"Payment and enrollment",
   complete:a.status==="ACTIVE_ENROLLMENT",active:finalized}
 ];
 const history=<p className="text-sm text-muted-foreground">This stage is complete. Original signed documents, billing snapshots and audit records remain on file.</p>;
 const command=(action:"READY"|"RETURN_TO_DRAFT"|"ACTIVATE",label:string,description:string)=>(
  <AdmissionCommandForm action={action} admissionId={a.id} data={data} label={label} description={description}/>
 );
 const panels={
  verify:<div className="space-y-4">
   <h2 className="text-xl font-semibold">Verify application</h2>
   {manage&&a.status==="DRAFT"&&<AdmissionIdentityEditor admission={a}/>}
   {manage&&a.status==="DRAFT"&&
    <AdmissionPlacementEditor admissionId={a.id} batchId={a.batchId??""} data={data}/>}
   <p className="text-sm text-muted-foreground">Confirm student identity, class, programme offering and actual batch. Public choices are preferences until verified by staff.</p>
   {a.status==="DRAFT"&&manage?command("READY","Details verified — continue",
     "Check the application above, save any corrections, then continue to admission source. This does not confirm admission.")
     :history}
  </div>,
  source:<div className="space-y-4">
   <h2 className="text-xl font-semibold">Admission source</h2>
   {a.status==="READY"&&manage?
    <ReferralForm admissionId={a.id} people={review.referrals} choice={review.referrals.choices[0]}/>
    :<p className="text-sm">{review.referral
      ?review.referral.source==="ORGANIC"?"Organic — no referrer":"Verified referral recorded"
      :"Admission source is not yet recorded."}</p>}
  </div>,
  consent:<div className="space-y-4">
   <h2 className="text-xl font-semibold">Signed consent</h2>
   <Link className="inline-flex min-h-11 items-center rounded-lg border px-4 py-2 text-sm"
    href={`/dashboard/admissions/${a.id}/print`}>Print two-page application and consent</Link>
   {a.status==="READY"&&hasReferral&&!hasConsent&&manage?
    <PhysicalConsentForm admissionId={a.id}/>
    :<p className="text-sm text-muted-foreground">{hasConsent
      ?"Signed paper form received for current application details. Retain the original."
      :"Verify application and record source first."}</p>}
  </div>,
  submit:<div className="space-y-4">
   <h2 className="text-xl font-semibold">Fees and final review</h2>
   <p className="text-sm text-muted-foreground">The active offering fee plan is the authority for initial charges. No payment is implied by an invoice.</p>
   {review.plan?<p className="text-sm">Selected fee plan: <strong>{review.plan.title}</strong></p>
    :<p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm">No active fee plan for this offering. Configure it before finalizing.</p>}
   <div className="overflow-x-auto rounded-xl border">
    <table className="w-full min-w-[380px] text-sm">
     <thead><tr className="border-b bg-muted/40 text-left"><th className="p-3">Charge</th><th className="p-3">Frequency</th><th className="p-3 text-right">BDT</th></tr></thead>
     <tbody>
      <tr className="border-b"><td className="p-3">Tuition</td><td className="p-3">Monthly</td><td className="p-3 text-right">{review.estimate.tuition.toFixed(2)}</td></tr>
      <tr className="border-b"><td className="p-3">Admission</td><td className="p-3">One-time</td><td className="p-3 text-right">{review.estimate.admission.toFixed(2)}</td></tr>
      {review.charges.filter(c=>c.is_active).map(c=><tr className="border-b" key={c.id}><td className="p-3">{c.name}</td><td className="p-3">One-time</td><td className="p-3 text-right">{c.amount.toFixed(2)}</td></tr>)}
      <tr className="border-t font-medium"><td className="p-3" colSpan={2}>Expected initial invoice after tuition discount ({review.discount.selected}%)</td><td className="p-3 text-right">{review.estimate.due.toFixed(2)}</td></tr>
     </tbody>
    </table>
   </div>
   {a.status==="READY"&&manage&&canBill?<div className="space-y-4">
    <ExtraChargeForm admissionId={a.id} charges={review.charges}/>
    <AdmissionDiscountForm admissionId={a.id} {...review.discount}/>
    {!review.discount.allowed.some(x=>x>0)&&<p className="text-xs text-muted-foreground">
     No tuition discounts are authorized in the current offering policy.</p>}
    {review.plan&&hasConsent&&hasReferral&&
     <FinalSubmissionReview key={`${a.id}:${review.discount.selected}:${review.version}`}
      admissionId={a.id} total={totalBeforeDiscount}
      discountPercent={review.discount.selected} tuitionTotal={review.estimate.tuition}/>}
    {command("RETURN_TO_DRAFT","Go back to correct application",
     "Return to Draft before billing. Previously verified paper consent must be re-checked after any identity change.")}
   </div>:a.status==="READY"&&!canBill?
    <p className="text-sm">Billing management permission is required to finalize and post the invoice.</p>
    :a.status==="ACCEPTED"?
     <p className="text-sm">This historical case is accepted but not billed. Review its existing billing action in the operational workbench before making changes.</p>
     :history}
  </div>,
  enroll:<div className="space-y-4">
   <h2 className="text-xl font-semibold">Payment and enrollment</h2>
   {a.invoice?<div className="rounded-xl bg-muted/40 p-4 text-sm">
    <p className="font-semibold">{a.invoice.number}</p>
    <p>Invoice: BDT {a.invoice.total.toFixed(2)} · Paid: BDT {a.invoice.paid.toFixed(2)} · Due: BDT {a.invoice.due.toFixed(2)}</p>
    {a.studentNo&&<p className="mt-1">Student ID: <span className="font-mono">{a.studentNo}</span></p>}
   </div>:<p className="text-sm text-muted-foreground">An initial invoice is issued during final submission. No invoice exists yet.</p>}
   {a.invoice&&a.invoice.due>0&&canPay&&
    <AdmissionCollectionForm admissionId={a.id} due={a.invoice.due}/>}
   {a.invoice&&a.invoice.due>0&&!canPay&&<p className="text-sm">A finance-authorized user must record payment before enrollment.</p>}
   {["BILLING_POSTED","PENDING_PAYMENT"].includes(a.status)&&manage&&(
    a.invoice&&a.invoice.due<=0?
     command("ACTIVATE","Activate enrollment","Confirm the batch has an available seat and the initial invoice is settled.")
     :<p className="rounded-xl border p-4 text-sm">Enrollment is pending settlement of the initial invoice. Credit enrollment is disabled until the original policy is migrated and verified.</p>
   )}
   {a.status==="ACTIVE_ENROLLMENT"&&<p className="rounded-xl border p-4 text-sm">
    Enrollment is active. Future installments and any outstanding balances stay in Student Accounts.
   </p>}
   {a.receipts.map(r=><Link key={r.number} className="block text-sm underline"
    href={`/dashboard/admissions/${a.id}/print?receipt=${encodeURIComponent(r.number)}`}>
     Print receipt {r.number} · BDT {r.amount.toFixed(2)}
    </Link>)}
   <Link className="inline-block text-sm underline"
    href={`/dashboard/finance/billing?returnTo=${encodeURIComponent(`/dashboard/admissions/${a.id}`)}`}>
     Other financial adjustments — return to this case afterwards
   </Link>
  </div>
 };
 return <div className="space-y-6">
  <PageHeader eyebrow={labels[a.origin]??"Admission case"} title={`${a.number} · ${a.name}`}
   description={`${a.offeringName} · ${a.batchName}${a.studentNo?` · ${a.studentNo}`:" · Student ID issued at final submission"}`}
   actions={<div className="flex flex-wrap items-center gap-2">
    <Link className="rounded-lg border px-4 py-2 text-sm" href="/dashboard/admissions">Admission register</Link>
    <Link className="rounded-lg border px-4 py-2 text-sm" href={`/dashboard/admissions/${a.id}/print`}>Print form</Link>
    <StatusBadge value={a.status}/>
   </div>}/>
  {!closed?<CaseStepNavigation steps={steps} panels={panels}/>:
   <p className="rounded-xl border p-5">This admission is closed. The original application, enrollment history and balances are retained.</p>}
  <details className="rounded-xl border p-5">
   <summary className="cursor-pointer font-semibold">Application record</summary>
   <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
    {[
     ["Student",a.name],["Guardian",a.guardian],["Mobile",a.mobile],
     ["Address",a.guardianAddress??"—"],["School",a.schoolName??"—"],
     ["Relationship",a.guardianRelationship??"—"],["Programme",a.offeringName],
     ["Batch",a.batchName],["Consent",hasConsent?"Current signed original on file":"Not recorded for current details"]
    ].map(([label,value])=><div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>)}
   </dl>
   {accepted&&<p className="mt-3 text-sm text-muted-foreground">Changes to finalized identity require a separate audited correction; issued financial records are immutable.</p>}
  </details>
 </div>;
}
