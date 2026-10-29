import Link from "next/link";
import {env} from "cloudflare:workers";
import {notFound} from "next/navigation";
import {z} from "zod";
import {PageHeader} from "@/components/erp/page-header";
import {StatusBadge} from "@/components/erp/status-badge";
import {requirePermission} from "@/modules/platform/auth/erp-context";

type Row={
 id:string;application_no:string;status:string;student_full_name:string;
 guardian_full_name:string;guardian_mobile:string;school_name:string|null;
 class_grade:number|null;created_at:string;review_note:string|null;
 consent_verified:number;batch_name:string|null;offering_name:string|null;
 student_no:string|null;bill_reference:string|null;bill_total_paisa:number|null;
 student_name_bn:string|null;guardian_address:string|null;
};
const statusMap:Record<string,string>={
 DRAFT:"DRAFT",REVIEW:"READY",ACCEPTED:"ACCEPTED",BILLED:"BILLING_POSTED",
 ENROLLED:"ACTIVE_ENROLLMENT",REJECTED:"CANCELLED",CANCELLED:"CANCELLED"
};
export default async function AdmissionCasePage({
 params
}:{params:Promise<{admissionId:string}>}){
 await requirePermission("admissions.view");
 const {admissionId}=await params;
 if(!z.string().uuid().safeParse(admissionId).success)notFound();
 const a=await env.DB.prepare([
  "SELECT a.id,a.application_no,a.status,a.student_full_name,a.guardian_full_name,",
  "a.guardian_mobile,a.school_name,a.class_grade,a.created_at,a.review_note,",
  "a.consent_verified,b.name AS batch_name,o.name AS offering_name,s.student_no,",
  "bill.reference AS bill_reference,bill.amount_paisa AS bill_total_paisa,",
  "d.student_name_bn,d.guardian_address",
  "FROM academy_admissions a",
  "JOIN public_programme_offerings o ON o.id=a.offering_id",
  "LEFT JOIN academy_batches b ON b.id=a.batch_id",
  "LEFT JOIN academy_students s ON s.id=a.student_id",
  "LEFT JOIN academy_admission_bills bill ON bill.admission_id=a.id",
  "LEFT JOIN academy_admission_intake_details d ON d.admission_id=a.id",
  "WHERE a.id=?"
 ].join(" ")).bind(admissionId).first<Row>();
 if(!a)notFound();
 const fields=[
  ["Applicant",a.student_full_name],["Bangla name",a.student_name_bn],
  ["Class",a.class_grade?String(a.class_grade):"Needs verification"],
  ["Guardian",a.guardian_full_name],["Guardian mobile",a.guardian_mobile],
  ["Guardian address",a.guardian_address],["School",a.school_name],
  ["Programme",a.offering_name],["Batch",a.batch_name??"Not yet assigned"],
  ["Permanent Student ID",a.student_no??"Assigned only after enrollment"],
  ["Signed consent verified",a.consent_verified?"Yes":"Not yet"],
  ["Prepared",new Date(a.created_at).toLocaleString("en-GB",{timeZone:"Asia/Dhaka"})],
 ];
 return <div className="space-y-7">
  <PageHeader eyebrow="Admission case · verified D1 record"
   title={a.application_no+" · "+a.student_full_name}
   description="The source case detail workflow is being migrated in phases. Identity, placement and billing shown here are persisted records, not provisional approvals."/>
  <div className="flex flex-wrap items-center gap-4 text-sm">
   <Link className="underline" href="/dashboard/admissions">Admission register</Link>
   <Link className="underline" href="/dashboard/students">Students</Link>
   <StatusBadge value={statusMap[a.status]??a.status}/>
  </div>
  <section className="rounded-2xl border bg-card p-5">
   <h2 className="font-semibold">Verified application data</h2>
   <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {fields.map(([label,value])=><div key={label}>
     <dt className="text-xs text-muted-foreground">{label}</dt>
     <dd className="mt-1 break-words text-sm font-medium">{value??"Not provided"}</dd>
    </div>)}
   </dl>
  </section>
  <section className="rounded-2xl border bg-card p-5">
   <h2 className="font-semibold">Billing and paper file</h2>
   <p className="mt-2 text-sm text-muted-foreground">{a.bill_reference
    ? "Initial bill "+a.bill_reference+" · BDT "+((a.bill_total_paisa??0)/100).toFixed(2)
    : "No initial bill has been posted for this case."}</p>
   <p className="mt-2 text-sm">Review note: {a.review_note??"Not recorded"}</p>
   <div className="mt-4 flex flex-wrap gap-4 text-sm">
    <Link className="underline" href={`/dashboard/admissions/${a.id}/print`}>Print original A4 admission case</Link>
    <Link className="underline" href="/app/admissions">Continue the existing operational admission workbench</Link>
   </div>
  </section>
  <p className="text-sm text-muted-foreground">Source case commands for return-to-draft, discounts, refunds and advanced placement are not yet migrated. Do not use this read-only screen as proof of their completion.</p>
 </div>;
}
