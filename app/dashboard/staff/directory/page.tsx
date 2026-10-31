import {redirect} from "next/navigation";

/** Legacy bookmark: staff access is requested publicly and managed in one place. */
export default function LegacyStaffDirectoryPage() {
  redirect("/dashboard/staff#staff-access");
}
