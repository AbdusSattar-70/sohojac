import {redirect} from "next/navigation";

/** One authoritative staff access queue; do not maintain a second review screen. */
export default function LegacyStaffAccessPage() {
  redirect("/dashboard/staff#staff-access");
}
