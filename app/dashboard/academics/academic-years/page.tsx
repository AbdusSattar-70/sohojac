import { redirect } from "next/navigation";
/** Old bookmarks resolve to the single Academic Setup workspace. */
export default function AcademicYearsPage() {
  redirect("/dashboard/academics/settings");
}
