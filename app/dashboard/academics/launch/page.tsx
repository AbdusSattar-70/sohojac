import Link from "next/link";
import { PageHeader } from "@/components/erp/page-header";
import { ProgrammeLaunchWorkspace } from "@/modules/offerings/components/programme-launch-workspace";
import { getOfferingOverview } from "@/modules/offerings/queries";
import { getBatchWorkspace } from "@/modules/academics/batches/queries";
import { requirePermission } from "@/modules/platform/auth/erp-context";
import { can } from "@/types/erp";

function dateInDhaka() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export default async function ProgrammeLaunchPage({
  searchParams,
}: {
  searchParams: Promise<{ offering?: string }>;
}) {
  const context = await requirePermission("academics.view");
  // Both queries enforce the same staff permission. The offering overview
  // excludes fee amounts when finance.view is absent.
  const [data, batches, params] = await Promise.all([
    getOfferingOverview(),
    getBatchWorkspace(),
    searchParams,
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Academy Setup"
        title="Programme Launch"
        description="Set up a coaching programme in five guided steps. The ERP checks fee readiness, actual seats and public intake before showing it as ready."
        actions={<Link className="inline-flex min-h-10 items-center rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted"
          href="/dashboard/academics/offerings">Advanced offering register</Link>}
      />
      <ProgrammeLaunchWorkspace
        data={data}
        batches={batches}
        initialOfferingId={params.offering}
        today={dateInDhaka()}
        canManage={can(context, "academics.manage")}
        canBill={can(context, "finance.billing.manage") && can(context, "finance.view")}
        canViewFees={can(context, "finance.view")}
      />
    </div>
  );
}
