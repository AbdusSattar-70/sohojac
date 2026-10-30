import { env } from "cloudflare:workers";
import { z } from "zod";
import { requirePermission } from "@/modules/platform/auth/erp-context";

/** Source Student Profile on canonical D1 ledgers. Verified duplicate links
 * expand history without reassigning original IDs. Unsupported refund/credit,
 * guardian-history and birth-date facts are omitted. */
export type StudentProfile = {
  student: { id:string; number:string; name:string; school:string|null; status:string; createdAt:string; canonicalId:string; canonicalNumber:string };
  identities: { id:string; number:string; name:string }[];
  guardian: { name:string; mobile:string };
  guardianContacts: { studentId:string; studentNumber:string; name:string; mobile:string }[];
  admissionsVisible:boolean;
  admissions: { id:string; number:string; studentId:string; status:string; createdAt:string; batch:string|null; batchId:string|null; offering:string; offeringId:string; feeVersion:number|null }[];
  enrollments: { id:string; studentId:string; year:string; class:string; batch:string; startsOn:string; endsOn:string|null; status:string }[];
  batches: { id:string; name:string; offeringId:string; offering:string; year:string; class:string; capacity:number; occupied:number }[];
  transfers: { id:string; fromBatch:string; toBatch:string; date:string; authorizedBy:string }[];
  candidates: { id:string; number:string; name:string; status:string; school:string|null; mobile:string }[];
  mergeBlocked:boolean;
  financeVisible:boolean;
  financeInvoiceCount:number;
  invoices: { id:string; studentId:string; studentNumber:string; number:string; issueOn:string; dueOn:string|null; gross:number; paid:number; due:number; status:string }[];
  financeTotals: { gross:number; paid:number; due:number }|null;
};
type StudentRow = { id:string; student_no:string; full_name:string; school_name:string|null; status:string; created_at:string; guardian_name:string; guardian_mobile:string; merged_into_id:string|null };
type AdmissionRow = { id:string; application_no:string; student_id:string; status:string; created_at:string; batch_name:string|null; batch_id:string|null; offering_name:string; offering_id:string; source_version:number|null };
type EnrollmentRow = { id:string; student_id:string; year_name:string; class_name:string; batch_name:string; enrolled_at:string; ended_on:string|null; status:string };
type BatchRow = { id:string; name:string; offering_id:string; offering_name:string; year_name:string; class_name:string; capacity:number; occupied:number };
type TransferRow = { id:string; from_batch:string; to_batch:string; transferred_on:string; authorized_by:string };
type InvoiceRow = { id:string; student_id:string; student_no:string; invoice_no:string; issue_on:string; due_on:string|null; amount_paisa:number; paid_paisa:number; status:string; invoice_count:number; total_amount_paisa:number; total_paid_paisa:number };
const historyIds = "SELECT id FROM academy_students WHERE id=? OR merged_into_id=?";

export async function getStudentProfile(studentId:string):Promise<StudentProfile|null> {
  const context = await requirePermission("students.view");
  if (!z.string().uuid().safeParse(studentId).success) return null;
  const student = await env.DB.prepare("SELECT * FROM academy_students WHERE id=?").bind(studentId).first<StudentRow>();
  if (!student) return null;
  const canonicalId = student.merged_into_id ?? student.id;
  const identities = await env.DB.prepare("SELECT * FROM academy_students WHERE id=? OR merged_into_id=? ORDER BY student_no,id")
    .bind(canonicalId,canonicalId).all<StudentRow>();
  const identityRows = identities.results ?? [];
  const canonical = identityRows.find(row => row.id === canonicalId);
  if (!canonical) return null;
  const history = [canonicalId,canonicalId];
  const admissionsVisible = context.permissions.includes("admissions.view");
  const financeVisible = context.permissions.includes("finance.view");
  const canManage = context.permissions.includes("students.manage");
  const canPlace = canManage || context.permissions.includes("admissions.create");
  const [admissions,enrollments,invoices,batches,transfers,candidates,blocked] = await Promise.all([
    admissionsVisible
      ? env.DB.prepare([
          "SELECT a.id,a.application_no,a.student_id,a.status,a.created_at,a.batch_id,a.offering_id,",
          "b.name AS batch_name,o.name AS offering_name,f.source_version",
          "FROM academy_admissions a JOIN public_programme_offerings o ON o.id=a.offering_id",
          "LEFT JOIN academy_batches b ON b.id=a.batch_id LEFT JOIN academy_fee_plans f ON f.id=a.fee_plan_id",
          "WHERE a.student_id IN ("+historyIds+") ORDER BY a.created_at DESC,a.id DESC",
        ].join(" ")).bind(...history).all<AdmissionRow>()
      : Promise.resolve({results:[] as AdmissionRow[]}),
    env.DB.prepare([
      "SELECT e.id,e.student_id,COALESCE(y.title,o.academic_year_name) AS year_name,",
      "o.class_name,b.name AS batch_name,e.enrolled_at,e.ended_on,e.status",
      "FROM academy_enrollments e JOIN academy_batches b ON b.id=e.batch_id",
      "JOIN public_programme_offerings o ON o.id=b.offering_id",
      "LEFT JOIN academic_years y ON y.id=COALESCE(b.year_id,o.academic_year_id)",
      "WHERE e.student_id IN ("+historyIds+") ORDER BY e.enrolled_at DESC,e.id DESC",
    ].join(" ")).bind(...history).all<EnrollmentRow>(),
    financeVisible
      ? env.DB.prepare([
          "SELECT i.id,i.student_id,s.student_no,i.invoice_no,i.issue_on,i.due_on,i.amount_paisa,i.paid_paisa,i.status,",
          "COUNT(*) OVER() AS invoice_count,SUM(i.amount_paisa) OVER() AS total_amount_paisa,",
          "SUM(i.paid_paisa) OVER() AS total_paid_paisa FROM finance_invoices i",
          "JOIN academy_students s ON s.id=i.student_id",
          "WHERE i.student_id IN ("+historyIds+") AND i.status IN ('ISSUED','PARTIAL','PAID')",
          "ORDER BY i.issue_on DESC,i.created_at DESC,i.id DESC LIMIT 200",
        ].join(" ")).bind(...history).all<InvoiceRow>()
      : Promise.resolve({results:[] as InvoiceRow[]}),
    canPlace
      ? env.DB.prepare([
          "SELECT b.id,b.name,b.offering_id,o.name AS offering_name,COALESCE(y.title,o.academic_year_name) AS year_name,",
          "o.class_name,b.capacity,(SELECT COUNT(*) FROM academy_enrollments e WHERE e.batch_id=b.id AND e.status='ACTIVE') AS occupied",
          "FROM academy_batches b JOIN public_programme_offerings o ON o.id=b.offering_id",
          "LEFT JOIN academic_years y ON y.id=COALESCE(b.year_id,o.academic_year_id)",
          "WHERE b.status='ACTIVE' AND o.is_active=1 AND (o.offering_status IS NULL OR o.offering_status='ACTIVE') ORDER BY b.name,b.id",
        ].join(" ")).all<BatchRow>()
      : Promise.resolve({results:[] as BatchRow[]}),
    env.DB.prepare([
      "SELECT t.id,b.name AS from_batch,d.name AS to_batch,t.transferred_on,t.authorized_by",
      "FROM academy_enrollment_transfers t JOIN academy_batches b ON b.id=t.from_batch_id",
      "JOIN academy_batches d ON d.id=t.to_batch_id",
      "WHERE t.student_id IN ("+historyIds+") ORDER BY t.created_at DESC,t.id DESC",
    ].join(" ")).bind(...history).all<TransferRow>(),
    canManage
      ? env.DB.prepare([
          "SELECT t.* FROM academy_students t JOIN academy_students s ON s.id=?",
          "WHERE t.id<>s.id AND t.merged_into_id IS NULL AND t.status<>'ARCHIVED'",
          "AND (lower(trim(t.full_name))=lower(trim(s.full_name)) OR",
          "(length(trim(s.guardian_mobile))>0 AND s.guardian_mobile=t.guardian_mobile)) ORDER BY t.student_no,t.id",
        ].join(" ")).bind(studentId).all<StudentRow>()
      : Promise.resolve({results:[] as StudentRow[]}),
    canManage
      ? env.DB.prepare([
          "SELECT CASE WHEN EXISTS(SELECT 1 FROM academy_enrollments WHERE student_id=? AND status='ACTIVE')",
          "OR EXISTS(SELECT 1 FROM academy_admissions WHERE student_id=? AND status NOT IN ('CANCELLED','REJECTED'))",
          "OR EXISTS(SELECT 1 FROM academy_students WHERE merged_into_id=?) THEN 1 ELSE 0 END AS blocked",
        ].join(" ")).bind(studentId,studentId,studentId).first<{blocked:number}>()
      : Promise.resolve(null),
  ]);
  const invoiceRows = invoices.results ?? [];
  const grossPaisa = invoiceRows[0]?.total_amount_paisa ?? 0;
  const paidPaisa = invoiceRows[0]?.total_paid_paisa ?? 0;
  return {
    student: {id:student.id,number:student.student_no,name:student.full_name,school:student.school_name,status:student.status,createdAt:student.created_at,canonicalId,canonicalNumber:canonical.student_no},
    identities:identityRows.map(row=>({id:row.id,number:row.student_no,name:row.full_name})),
    guardian:{name:student.guardian_name,mobile:student.guardian_mobile},
    guardianContacts:identityRows.map(row=>({studentId:row.id,studentNumber:row.student_no,name:row.guardian_name,mobile:row.guardian_mobile})),
    admissionsVisible,
    admissions:(admissions.results??[]).map(row=>({id:row.id,number:row.application_no,studentId:row.student_id,status:row.status,createdAt:row.created_at,batch:row.batch_name,batchId:row.batch_id,offering:row.offering_name,offeringId:row.offering_id,feeVersion:row.source_version})),
    enrollments:(enrollments.results??[]).map(row=>({id:row.id,studentId:row.student_id,year:row.year_name,class:row.class_name,batch:row.batch_name,startsOn:row.enrolled_at,endsOn:row.ended_on,status:row.status})),
    batches:(batches.results??[]).map(row=>({id:row.id,name:row.name,offeringId:row.offering_id,offering:row.offering_name,year:row.year_name,class:row.class_name,capacity:row.capacity,occupied:row.occupied})),
    transfers:(transfers.results??[]).map(row=>({id:row.id,fromBatch:row.from_batch,toBatch:row.to_batch,date:row.transferred_on,authorizedBy:row.authorized_by})),
    candidates:(candidates.results??[]).map(row=>({id:row.id,number:row.student_no,name:row.full_name,status:row.status,school:row.school_name,mobile:row.guardian_mobile})),
    mergeBlocked:blocked?.blocked===1,
    financeVisible,
    financeInvoiceCount:invoiceRows[0]?.invoice_count??0,
    invoices:invoiceRows.map(row=>({id:row.id,studentId:row.student_id,studentNumber:row.student_no,number:row.invoice_no,issueOn:row.issue_on,dueOn:row.due_on,gross:row.amount_paisa/100,paid:row.paid_paisa/100,due:(row.amount_paisa-row.paid_paisa)/100,status:row.status})),
    financeTotals:financeVisible?{gross:grossPaisa/100,paid:paidPaisa/100,due:(grossPaisa-paidPaisa)/100}:null,
  };
}
