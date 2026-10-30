"use server";
import { revalidatePath } from "next/cache";
import { studentCommandSchema, type StudentCommand } from "./schema";
import { executeStudentCommand } from "./command-store";
import { studentCommandActor } from "./command-context";

export async function runStudentCommand(input: StudentCommand) {
  const parsed = studentCommandSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the student command." };
  const value = parsed.data;
  const actor = await studentCommandActor(value.action === "CREATE_EXISTING" ? "admissions.create" : "students.manage");
  if (!actor) return { ok: false, message: "Student command permission and a valid staff origin are required." };
  const result = await executeStudentCommand(value, actor);
  if (result.ok) {
    for (const path of [
      "/dashboard/students", "/dashboard/admissions", "/dashboard/academics/batches",
      "/dashboard/finance/billing", "/dashboard/governance/audit", "/dashboard/action-center", "/dashboard",
    ]) revalidatePath(path);
    revalidatePath("/dashboard/students/[studentId]", "page");
    revalidatePath("/dashboard/admissions/[admissionId]", "page");
  }
  return result;
}
