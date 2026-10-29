import { env } from "cloudflare:workers";
import { requirePermission } from "@/modules/platform/auth/erp-context";

/** Original modules/students/queries.ts return contract, implemented on D1.
 * No public website enquiry is ever represented as an admitted student.
 * The canonical academy_students ledger is populated only by atomic enrollment.
 */
export type StudentListRow = {
  id: string;
  studentNo: string;
  fullName: string;
  schoolName: string;
  status: string;
  createdAt: string;
};
export type StudentListPage = {
  rows: StudentListRow[];
  total: number;
  page: number;
  pageSize: number;
};
type Row = {
  id: string; student_no: string; full_name: string;
  school_name: string | null; status: string; created_at: string;
};
const studentColumns = "id,student_no,full_name,school_name,status,created_at";

export async function getStudentList({
  page = 1, query = "", pageSize = 50,
}: { page?: number; query?: string; pageSize?: number } = {}): Promise<StudentListPage> {
  await requirePermission("students.view");
  const safePage = Number.isSafeInteger(page) ? Math.min(10000, Math.max(1, page)) : 1;
  const safePageSize = Number.isSafeInteger(pageSize)
    ? Math.min(100, Math.max(10, pageSize)) : 50;
  const needle = query.trim().slice(0, 80);
  const where = needle
    ? " WHERE instr(lower(student_no),lower(?))>0" +
      " OR instr(lower(full_name),lower(?))>0" +
      " OR instr(lower(COALESCE(school_name,'')),lower(?))>0"
    : "";
  const params = needle ? [needle, needle, needle] : [];
  const [list, count] = await Promise.all([
    env.DB.prepare(
      "SELECT " + studentColumns + " FROM academy_students" + where +
      " ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?"
    ).bind(...params, safePageSize, (safePage - 1) * safePageSize).all<Row>(),
    env.DB.prepare(
      "SELECT COUNT(*) AS n FROM academy_students" + where
    ).bind(...params).first<{ n: number }>(),
  ]);
  return {
    rows: (list.results ?? []).map(student => ({
      id: student.id,
      studentNo: student.student_no,
      fullName: student.full_name,
      schoolName: student.school_name ?? "—",
      status: student.status,
      createdAt: student.created_at,
    })),
    total: count?.n ?? 0,
    page: safePage,
    pageSize: safePageSize,
  };
}
