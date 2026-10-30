import { env } from "cloudflare:workers";
import { z } from "zod";
import { requirePermission } from "@/modules/platform/auth/erp-context";

/**
 * Read-only D1 adapter for the original Student Profile workspace.
 * Only facts supported by the current ledgers are exposed. Canonical identity
 * merges, guardian history, transfers, fee versions and refunds are not inferred.
 */
export type StudentProfile = {
  student: {
    id: string;
    number: string;
    name: string;
    school: string | null;
    status: string;
    createdAt: string;
  };
  guardian: { name: string; mobile: string };
  admissionsVisible: boolean;
  admissions: {
    id: string;
    number: string;
    status: string;
    createdAt: string;
    batch: string | null;
    offering: string;
  }[];
  enrollments: {
    id: string;
    year: string;
    class: string;
    batch: string;
    startsOn: string;
    status: string;
  }[];
  financeVisible: boolean;
  financeInvoiceCount: number;
  invoices: {
    id: string;
    number: string;
    issueOn: string;
    dueOn: string | null;
    gross: number;
    paid: number;
    due: number;
    status: string;
  }[];
  financeTotals: { gross: number; paid: number; due: number } | null;
};

type StudentRow = {
  id: string;
  student_no: string;
  full_name: string;
  school_name: string | null;
  status: string;
  created_at: string;
  guardian_name: string;
  guardian_mobile: string;
};
type AdmissionRow = {
  id: string;
  application_no: string;
  status: string;
  created_at: string;
  batch_name: string | null;
  offering_name: string;
};
type EnrollmentRow = {
  id: string;
  year_name: string;
  class_name: string;
  batch_name: string;
  enrolled_at: string;
  status: string;
};
type InvoiceRow = {
  id: string;
  invoice_no: string;
  issue_on: string;
  due_on: string | null;
  amount_paisa: number;
  paid_paisa: number;
  status: string;
  invoice_count: number;
  total_amount_paisa: number;
  total_paid_paisa: number;
};

export async function getStudentProfile(
  studentId: string,
): Promise<StudentProfile | null> {
  const context = await requirePermission("students.view");
  if (!z.string().uuid().safeParse(studentId).success) return null;

  const student = await env.DB.prepare(
    "SELECT id,student_no,full_name,school_name,status,created_at," +
      "guardian_name,guardian_mobile FROM academy_students WHERE id=?",
  ).bind(studentId).first<StudentRow>();
  if (!student) return null;

  const admissionsVisible = context.permissions.includes("admissions.view");
  const financeVisible = context.permissions.includes("finance.view");
  const [admissions, enrollments, invoices] = await Promise.all([
    admissionsVisible
      ? env.DB.prepare([
          "SELECT a.id,a.application_no,a.status,a.created_at,",
          "b.name AS batch_name,o.name AS offering_name",
          "FROM academy_admissions a",
          "JOIN public_programme_offerings o ON o.id=a.offering_id",
          "LEFT JOIN academy_batches b ON b.id=a.batch_id",
          "WHERE a.student_id=? ORDER BY a.created_at DESC,a.id DESC",
        ].join(" ")).bind(studentId).all<AdmissionRow>()
      : Promise.resolve({ results: [] as AdmissionRow[] }),
    env.DB.prepare([
      "SELECT e.id,COALESCE(y.title,o.academic_year_name) AS year_name,",
      "o.class_name,b.name AS batch_name,e.enrolled_at,e.status",
      "FROM academy_enrollments e",
      "JOIN academy_batches b ON b.id=e.batch_id",
      "JOIN public_programme_offerings o ON o.id=b.offering_id",
      "LEFT JOIN academic_years y ON y.id=b.year_id",
      "WHERE e.student_id=? ORDER BY e.enrolled_at DESC,e.id DESC",
    ].join(" ")).bind(studentId).all<EnrollmentRow>(),
    financeVisible
      ? env.DB.prepare([
          "SELECT id,invoice_no,issue_on,due_on,amount_paisa,paid_paisa,status,",
          "COUNT(*) OVER() AS invoice_count,",
          "SUM(amount_paisa) OVER() AS total_amount_paisa,",
          "SUM(paid_paisa) OVER() AS total_paid_paisa",
          "FROM finance_invoices WHERE student_id=?",
          "AND status IN ('ISSUED','PARTIAL','PAID')",
          "ORDER BY issue_on DESC,created_at DESC,id DESC LIMIT 200",
        ].join(" ")).bind(studentId).all<InvoiceRow>()
      : Promise.resolve({ results: [] as InvoiceRow[] }),
  ]);

  const invoiceRows = invoices.results ?? [];
  // Window aggregates describe all posted invoices, even when only the latest
  // 200 are shown. Integer paisa sums and the visible rows share one snapshot.
  const grossPaisa = invoiceRows[0]?.total_amount_paisa ?? 0;
  const paidPaisa = invoiceRows[0]?.total_paid_paisa ?? 0;
  return {
    student: {
      id: student.id,
      number: student.student_no,
      name: student.full_name,
      school: student.school_name,
      status: student.status,
      createdAt: student.created_at,
    },
    guardian: { name: student.guardian_name, mobile: student.guardian_mobile },
    admissionsVisible,
    admissions: (admissions.results ?? []).map((row) => ({
      id: row.id,
      number: row.application_no,
      status: row.status,
      createdAt: row.created_at,
      batch: row.batch_name,
      offering: row.offering_name,
    })),
    enrollments: (enrollments.results ?? []).map((row) => ({
      id: row.id,
      year: row.year_name,
      class: row.class_name,
      batch: row.batch_name,
      startsOn: row.enrolled_at,
      status: row.status,
    })),
    financeVisible,
    financeInvoiceCount: invoiceRows[0]?.invoice_count ?? 0,
    invoices: invoiceRows.map((row) => ({
      id: row.id,
      number: row.invoice_no,
      issueOn: row.issue_on,
      dueOn: row.due_on,
      gross: row.amount_paisa / 100,
      paid: row.paid_paisa / 100,
      due: (row.amount_paisa - row.paid_paisa) / 100,
      status: row.status,
    })),
    financeTotals: financeVisible ? {
      gross: grossPaisa / 100,
      paid: paidPaisa / 100,
      due: (grossPaisa - paidPaisa) / 100,
    } : null,
  };
}
