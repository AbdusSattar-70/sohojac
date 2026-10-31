import Link from "next/link";
import { AcademyIdentityForm } from "@/modules/platform/setup/identity-form";
import { getAcademyIdentity } from "@/modules/platform/setup/identity-queries";
import { PageHeader } from "@/components/erp/page-header";
import { MasterDataWorkspace } from "@/modules/crm/manage/components/master-data-workspace";
import { getManageCrmOverview } from "@/modules/crm/manage/queries";
import { requirePermission } from "@/modules/platform/auth/erp-context";
import { can } from "@/types/erp";

export default async function AcademicSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{section?: string}>;
}) {
  const {section} = await searchParams;
  const context = await requirePermission("system.master_data.manage");
  const data = await getManageCrmOverview();
  const canManage = can(context, "system.master_data.manage");

  const identity = context.permissions.includes("system.settings.manage") ? await getAcademyIdentity() : null;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Academic setup"
        title="Academic & registration settings"
        description="Manage classes, subjects, years, programmes and reusable registration lists. Public forms use these lists; they are not website content. Deactivate rather than delete so history stays intact."
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div>
          <p className="font-medium">One global subject catalogue</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Subjects are defined here once. Class and programme applicability belong to teaching plans, not duplicated master records.
          </p>
        </div>
        <Link href="/dashboard/academics/subjects"
          className="inline-flex min-h-10 items-center rounded-xl border border-border bg-background px-4 text-sm font-medium hover:bg-muted">
          Review Subject Directory
        </Link>
      </div>

      {identity && <AcademyIdentityForm {...identity} />}

      <MasterDataWorkspace data={data} canManage={canManage} initialEntity={section === "subject" ? "subject" : "class"} />
    </div>
  );
}
