"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { executeStudentState } from "./command-store";
import { studentCommandActor } from "./command-context";

export async function changeStudentRecordState(input: unknown) {
  const parsed = z.object({
    id: z.string().uuid(), active: z.boolean(), reason: z.string().trim().min(5).max(500),
  }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the Student ID, state and reason." };
  const actor = await studentCommandActor("students.manage", false);
  if (!actor) return { ok: false, message: "Student management permission and a valid staff origin are required." };
  const result = await executeStudentState(parsed.data, actor);
  if (result.ok) {
    revalidatePath("/dashboard/students");
    revalidatePath(`/dashboard/students/${parsed.data.id}`);
    revalidatePath("/dashboard/governance/audit");
  }
  return result;
}
