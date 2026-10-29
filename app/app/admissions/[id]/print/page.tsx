import {env} from "cloudflare:workers";
import {headers} from "next/headers";
import {redirect,notFound} from "next/navigation";
import {getStaffAccessForPage} from "@/lib/staff-access";
export const dynamic="force-dynamic";
export const metadata={title:"Admission form · Sohoj Academy",robots:{index:false,follow:false}};
type Context={params:Promise<{id:string}>};
type AdmissionForm={
  application_no:string;status:string;student_full_name:string;class_grade:number|null;
  guardian_full_name:string;guardian_mobile:string;school_name:string|null;
  created_at:string;offering_name:string;branch_name:string;
  batch_name:string|null;fee_plan_title:string|null;
  monthly_amount_paisa:number|null;admission_amount_paisa:number|null;
  prepared_name:string|null;verified_name:string|null;approved_name:string|null;
  consent_verified:number;review_note:string|null;
};
export default async function AdmissionFormPage({params}:Context){
  const staff=await getStaffAccessForPage(await headers());
  if(!staff)redirect("/sign-in");
  if(staff.role==="TEACHER")redirect("/app");
  const {id}=await params;
  if(!/^[0-9a-f-]{36}$/i.test(id))notFound();
  const a=await env.DB.prepare([
    "SELECT a.application_no,a.status,a.student_full_name,a.class_grade,",
    "a.guardian_full_name,a.guardian_mobile,a.school_name,a.created_at,",
    "p.name AS offering_name,p.branch_name,b.name AS batch_name,f.title AS fee_plan_title,",
    "COALESCE(bill.monthly_amount_paisa,f.monthly_amount_paisa) AS monthly_amount_paisa,",
    "COALESCE(bill.admission_amount_paisa,f.admission_amount_paisa) AS admission_amount_paisa,",
    "prep.name AS prepared_name,verified.name AS verified_name,approved.name AS approved_name,",
    "a.consent_verified,a.review_note",
    "FROM academy_admissions a JOIN public_programme_offerings p ON p.id=a.offering_id",
    "LEFT JOIN academy_batches b ON b.id=a.batch_id",
    "LEFT JOIN academy_fee_plans f ON f.id=a.fee_plan_id",
    "LEFT JOIN academy_admission_bills bill ON bill.admission_id=a.id",
    "LEFT JOIN \"user\" prep ON prep.id=a.prepared_by",
    "LEFT JOIN \"user\" verified ON verified.id=a.verified_by",
    "LEFT JOIN \"user\" approved ON approved.id=a.approved_by",
    "WHERE a.id=?"
  ].join(" ")).bind(id).first<AdmissionForm>();
  if(!a)notFound();
  const date=a.created_at.slice(0,10);
  const amount=(v:number|null)=>v===null?"To be assigned":"৳"+(v/100).toFixed(2);
  return <>
    <style>{"@page{size:A4;margin:0;}@media print{html,body{margin:0!important;padding:0!important;background:white!important}main{box-shadow:none!important;border:none!important;width:210mm!important;min-height:297mm!important;break-after:avoid!important}}@media screen{body{background:#f1f5f9;}} "}</style>
    <main lang="en" className="erp-paper mx-auto flex min-h-[297mm] w-[210mm] max-w-full flex-col bg-white px-[12mm] pb-[10mm] pt-0 text-slate-950 shadow-md print:shadow-none">
      <header className="flex items-start justify-between gap-4 border-b-2 border-slate-800 py-4">
        <div><h1 className="text-[23px] font-extrabold tracking-tight">SOHOJ ACADEMY</h1>
          <p className="text-[11px] text-slate-600">Learning made easy & fun · {a.branch_name}</p></div>
        <div className="text-right"><p className="text-[15px] font-extrabold">Admission & Consent Form</p>
          <p className="text-[11px]">Application: {a.application_no}</p>
          <p className="text-[11px]">Prepared: {date}</p></div>
      </header>
      <div className="mt-3 flex items-center justify-between text-[11px]">
        <p><strong>Current status:</strong> {a.status}</p>
        <p><strong>Signed documents verified:</strong> {a.consent_verified?"Yes":"Pending"}</p>
      </div>
      <section className="mt-4">
        <h2 className="border-b border-slate-300 pb-1 text-[13px] font-extrabold">1. Student information</h2>
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-[12px]">
          <p className="col-span-2"><strong>Full name:</strong> {a.student_full_name}</p>
          <p><strong>Class:</strong> {a.class_grade??"—"}</p>
          <p><strong>Current school:</strong> {a.school_name||"Not provided"}</p>
          <p className="col-span-2"><strong>Programme:</strong> {a.offering_name}</p>
          <p className="col-span-2"><strong>Batch:</strong> {a.batch_name||"To be allocated"}</p>
        </div>
      </section>
      <section className="mt-5">
        <h2 className="border-b border-slate-300 pb-1 text-[13px] font-extrabold">2. Parent or guardian information</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
          <p><strong>Full name:</strong> {a.guardian_full_name}</p>
          <p><strong>Mobile:</strong> {a.guardian_mobile}</p>
        </div>
      </section>
      <section className="mt-5">
        <h2 className="border-b border-slate-300 pb-1 text-[13px] font-extrabold">3. Programme fee summary</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
          <p className="col-span-2"><strong>Fee plan:</strong> {a.fee_plan_title||"Awaiting approval"}</p>
          <p><strong>Monthly tuition:</strong> {amount(a.monthly_amount_paisa)}</p>
          <p><strong>One-time admission:</strong> {amount(a.admission_amount_paisa)}</p>
        </div>
        <p className="mt-2 text-[10px] text-slate-600">Rates are subject to the approved plan. A separate bill and receipt document each financial transaction.</p>
      </section>
      <section className="mt-5">
        <h2 className="border-b border-slate-300 pb-1 text-[13px] font-extrabold">4. Student and guardian declaration</h2>
        <p className="mt-3 text-justify text-[11px] leading-5">
          We confirm that the information above is accurate to the best of our knowledge.
          We understand that admission is subject to academy verification, programme
          capacity, attendance requirements and communicated fee terms. We consent to
          the academy maintaining necessary academic and guardian contact records,
          including SMS notifications related to coaching operations.
        </p>
        <div className="mt-12 grid grid-cols-2 gap-10 text-[11px]">
          <div><div className="border-t border-slate-700 pt-2"><strong>Student signature</strong></div><p className="mt-1">Date: __________________</p></div>
          <div><div className="border-t border-slate-700 pt-2"><strong>Guardian signature</strong></div><p className="mt-1">Date: __________________</p></div>
        </div>
      </section>
      <section className="mt-7 border-t border-slate-300 pt-3">
        <h2 className="text-[12px] font-extrabold">5. Internal verification record — system-generated</h2>
        <div className="mt-2 grid grid-cols-3 gap-3 text-[11px]">
          <p><strong>Prepared by</strong><span className="mt-1 block">{a.prepared_name||"Pending"}</span></p>
          <p><strong>Verified by</strong><span className="mt-1 block">{a.verified_name||"Pending"}</span></p>
          <p><strong>Approved by</strong><span className="mt-1 block">{a.approved_name||"Pending"}</span></p>
        </div>
        <p className="mt-2 text-[10px] text-slate-500">Official staff signatures are not required for this system-generated record. Student and guardian signatures must be obtained on paper.</p>
      </section>
      <footer className="mt-auto border-t border-slate-200 pt-3 text-center text-[10px] text-slate-500">
        Sohoj Academy · Admission reference {a.application_no} · Keep the signed original in the admission file.
      </footer>
      <p className="py-2 text-center text-[11px] text-blue-700 print:hidden">Print this page using A4 paper, portrait orientation and zero browser margins.</p>
    </main>
  </>;
}
