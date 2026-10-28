import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getStaffAccess, canManageProspects } from "@/lib/staff-access";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, title: "Staff workspace" };

export default async function StaffHome() {
  const h = await headers();
  const origin = new URL(
    (h.get("x-forwarded-proto") ?? "https") + "://" + (h.get("host") ?? "invalid")
  ).origin;
  const staff = await getStaffAccess(origin + "/app", h);
  if (!staff) redirect("/sign-in");
  return (
    <main className="mx-auto max-w-4xl space-y-8 px-5 py-12">
      <header className="space-y-2">
        <p className="text-sm text-blue-400">SOHOJ ACADEMY / STAFF</p>
        <h1 className="text-3xl font-bold">Welcome, {staff.name}</h1>
        <p className="text-sm text-muted-foreground">Role: {staff.role}. Staff-only area.</p>
      </header>
      {canManageProspects(staff) ? (
        <Link href="/app/prospects" className="block rounded-2xl border border-border bg-card p-6 hover:border-blue-500">
          <h2 className="text-lg font-semibold">Prospect enquiries</h2>
          <p className="mt-2 text-sm text-muted-foreground">View registration requests, update follow-up status and review audit history.</p>
        </Link>
      ) : <p className="rounded-xl border border-border p-5">Your account does not have prospect-management permissions.</p>}
      <p className="text-xs text-muted-foreground">An enquiry is not an admission. No student, fee or seat is created here.</p>
    </main>
  );
}
