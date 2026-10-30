"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { executeEnrollmentClosure } from "./command-store";
import { studentCommandActor } from "./command-context";

export async function closeEnrollment(input: unknown) {
  const parsed = z.object({
    student_id: z.string().uuid(),
    enrollment_id: z.string().uuid(),
    mode: z.enum(["WITHDRAWN", "COMPLETED"]),
    reason: z.string().trim().min(5).max(500),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Choose a closure type and reason." };
  const actor = await studentCommandActor("students.manage", false);
  if (!actor) return { ok: false, message: "Student management permission and a valid staff origin are required." };
  const result = await executeEnrollmentClosure(parsed.data, actor);
  if (result.ok) {
    for (const path of [
      "/dashboard/students", "/dashboard/admissions", "/dashboard/finance/billing",
      "/dashboard/academics/batches", "/dashboard/governance/audit", "/dashboard",
    ]) revalidatePath(path);
    revalidatePath(`/dashboard/students/${parsed.data.student_id}`);
    revalidatePath("/dashboard/admissions/[admissionId]", "page");
  }
  return result;
}
