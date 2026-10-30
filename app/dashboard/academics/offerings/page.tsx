import Link from "next/link";
import { PageHeader } from "@/components/erp/page-header";
import { OfferingRegister } from "@/modules/offerings/components/offering-register";
import { getOfferingOverview } from "@/modules/offerings/queries";
import { requirePermission } from "@/modules/platform/auth/erp-context";
import { can } from "@/types/erp";

export default async function ProgrammeOfferingsPage() {
  const context = await requirePermission("academics.view");
  const data = await getOfferingOverview();
  return <div className="space-y-7">
    <PageHeader eyebrow="Academics" title="Advanced Programme Register"
      description="Manage advanced offering details and existing records. For normal coaching setup, the guided Programme Launch workspace is easier."
      actions={<Link href="/dashboard/academics/launch"
        className="inline-flex min-h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">Open Programme Launch</Link>}/>
    <OfferingRegister data={data} canManage={can(context,"academics.manage")} canViewFees={can(context,"finance.view")}/>
  </div>;
}
