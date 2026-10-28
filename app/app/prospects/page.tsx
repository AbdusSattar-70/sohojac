import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { canManageProspects, getStaffAccessForPage } from "@/lib/staff-access";
import { StaffProspects } from "@/components/staff/staff-prospects";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, title: "Enquiries · Digital Campus" };

export default async function ProspectsPage({ searchParams }: {
  searchParams: Promise<{ status?: string }>;
}) {
  const staff = await getStaffAccessForPage(await headers());
  if (!staff) redirect("/sign-in");
  if (!canManageProspects(staff)) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-8">
      <h1 className="text-xl font-bold text-slate-900">Access restricted</h1>
      <p className="mt-2 text-sm text-slate-500">Your staff role cannot view guardian or student enquiry records.</p>
      <Link href="/app" className="mt-4 inline-block text-sm font-semibold text-blue-700 underline">Return to overview</Link>
    </div>;
  }
  const { status } = await searchParams;
  const initialStatus = ["NEW", "CONTACTED", "CLOSED"].includes(status ?? "") ?
    status as "NEW" | "CONTACTED" | "CLOSED" : "ALL";
  return <StaffProspects initialStatus={initialStatus}/>;
}
