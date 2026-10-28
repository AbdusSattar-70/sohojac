import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { StaffShell } from "@/components/staff/staff-shell";
import { getStaffAccessForPage } from "@/lib/staff-access";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function StaffAreaLayout({ children }: { children: React.ReactNode }) {
  const staff = await getStaffAccessForPage(await headers());
  if (!staff) redirect("/sign-in");
  return <StaffShell staff={staff}>{children}</StaffShell>;
}
