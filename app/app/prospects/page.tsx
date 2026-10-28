import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { canManageProspects, getStaffAccessForPage } from "@/lib/staff-access";
import { StaffProspects } from "@/components/staff/staff-prospects";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, title: "Prospect CRM" };

export default async function ProspectsPage() {
  const h = await headers();
  const staff = await getStaffAccessForPage(h);
  if (!staff) redirect("/sign-in");
  if (!canManageProspects(staff)) {
    return <main className="mx-auto max-w-3xl p-8"><h1 className="text-xl font-bold">Access denied</h1>
      <Link href="/app" className="mt-4 inline-block underline">Back to workspace</Link></main>;
  }
  return <StaffProspects staffName={staff.name} role={staff.role}/>;
}
