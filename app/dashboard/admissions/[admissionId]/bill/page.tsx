import {env} from "cloudflare:workers";
import {headers} from "next/headers";
import {redirect,notFound} from "next/navigation";
import {getStaffAccessForPage} from "@/lib/staff-access";

export const dynamic="force-dynamic";
export const metadata={title:"Admission bill · Sohoj Academy",robots:{index:false,follow:false}};
type Context={params:Promise<{admissionId:string}>};
type Record={
  application_no:string;student_full_name:string;class_grade:number;
  guardian_full_name:string;guardian_mobile:string;offering_name:string;
  batch_name:string;reference:string;issue_on:string;monthly_amount_paisa:number;
  admission_amount_paisa:number;amount_paisa:number;
};
export default async function AdmissionBillPage({params}:Context){
  const staff=await getStaffAccessForPage(await headers());
  if(!staff)redirect("/sign-in");
  if(staff.role==="TEACHER")redirect("/app");
  const {admissionId:id}=await params;
  if(!/^[0-9a-f-]{36}$/i.test(id))notFound();
  const record=await env.DB.prepare([
    "SELECT a.application_no,a.student_full_name,a.class_grade,a.guardian_full_name,",
    "a.guardian_mobile,p.name AS offering_name,b.name AS batch_name,",
    "bill.reference,bill.issue_on,bill.monthly_amount_paisa,bill.admission_amount_paisa,bill.amount_paisa",
    "FROM academy_admission_bills bill JOIN academy_admissions a ON a.id=bill.admission_id",
    "JOIN public_programme_offerings p ON p.id=a.offering_id",
    "JOIN academy_batches b ON b.id=a.batch_id WHERE a.id=?"
  ].join(" ")).bind(id).first<Record>();
  if(!record)notFound();
  const taka=(v:number)=>"৳"+(v/100).toFixed(2);
  return <main className="erp-paper mx-auto min-h-screen max-w-[210mm] bg-white p-8 text-slate-900 print:p-0">
    <div className="border-b-2 border-slate-800 pb-4">
      <h1 className="text-2xl font-extrabold">Sohoj Academy</h1>
      <p className="text-xs text-slate-500">Learning made easy & fun</p>
      <h2 className="mt-4 text-lg font-bold">Initial admission bill</h2>
      <p className="text-sm">Reference: {record.reference} · Issued {record.issue_on}</p>
    </div>
    <div className="my-6 grid grid-cols-2 gap-4 text-sm">
      <p><strong>Student:</strong> {record.student_full_name}</p>
      <p><strong>Class:</strong> {record.class_grade}</p>
      <p><strong>Guardian:</strong> {record.guardian_full_name}</p>
      <p><strong>Guardian contact:</strong> {record.guardian_mobile}</p>
      <p><strong>Programme:</strong> {record.offering_name}</p>
      <p><strong>Batch:</strong> {record.batch_name}</p>
      <p className="col-span-2"><strong>Application:</strong> {record.application_no}</p>
    </div>
    <table className="w-full border-collapse text-left text-sm">
      <thead><tr className="border-y border-slate-700"><th className="py-3">Charge</th><th className="py-3 text-right">Amount</th></tr></thead>
      <tbody>
        <tr className="border-b border-slate-200"><td className="py-3">One-time admission fee</td><td className="text-right">{taka(record.admission_amount_paisa)}</td></tr>
        <tr className="border-b border-slate-200"><td className="py-3">First month tuition</td><td className="text-right">{taka(record.monthly_amount_paisa)}</td></tr>
        <tr className="border-t-2 border-slate-900 font-bold"><td className="py-4">Total due</td><td className="text-right">{taka(record.amount_paisa)}</td></tr>
      </tbody>
    </table>
    <p className="mt-6 text-xs text-slate-600">This document is a bill, not proof of payment. A receipt is issued separately after collection. Enrollment requires a further verified step.</p>
    <p className="mt-8 text-xs text-slate-500 print:hidden">Use your browser’s Print command to save or print this A4 bill.</p>
  </main>;
}
