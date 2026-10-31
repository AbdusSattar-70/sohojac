import Link from "next/link";
import { AcademyIdentityForm } from "@/modules/platform/setup/identity-form";
import { getAcademyIdentity } from "@/modules/platform/setup/identity-queries";
import { PageHeader } from "@/components/erp/page-header";
import { MasterDataWorkspace } from "@/modules/crm/manage/components/master-data-workspace";
import { getManageCrmOverview } from "@/modules/crm/manage/queries";
import { requirePermission } from "@/modules/platform/auth/erp-context";
import { can } from "@/types/erp";
import type { MasterEntity } from "@/modules/crm/manage/schema";

export default async function AcademicSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{section?: string; identity?: string}>;
}) {
  const {section, identity: identityMode} = await searchParams;
  const validSections: MasterEntity[] = ["academic_year", "class", "group", "subject", "program", "school", "lead_source", "guardian_relationship"];
  const selectedEntity: MasterEntity = validSections.find((entry) => entry === section) ?? "class";
  const sectionTitles: Record<MasterEntity, string> = {
    academic_year: "Academic years", class: "Classes", group: "Groups",
    subject: "Subjects", program: "Programmes", school: "Schools",
    lead_source: "Lead sources", guardian_relationship: "Guardian relationships",
  };
  const contextualTitle = section && validSections.includes(selectedEntity)
    ? sectionTitles[selectedEntity] : "Academic & registration settings";
  const context = await requirePermission("system.master_data.manage");
  const data = await getManageCrmOverview();
  const canManage = can(context, "system.master_data.manage");

  const identity = context.permissions.includes("system.settings.manage") ? await getAcademyIdentity() : null;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Academic setup"
        title={contextualTitle}
        description={selectedEntity === "subject" && section === "subject"
          ? "Manage each subject once for use across classes and programmes. Select subjects in teaching plans without duplicating master records."
          : "Manage classes, subjects, years, programmes and reusable registration lists. Public forms use these lists; they are not website content. Deactivate rather than delete so history stays intact."}
      />

      {identity && !identity.confirmed && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-sm">
          <p className="text-muted-foreground">Academy details have not been confirmed yet. Complete the one-time setup from your dashboard.</p>
          <Link href="/dashboard" className="inline-flex min-h-10 items-center rounded-lg border px-4 font-semibold hover:bg-muted">Finish first-time setup</Link>
        </div>
      )}
      {identity?.confirmed && identityMode === "edit" ? (
        <AcademyIdentityForm name={identity.name} branchName={identity.branchName} mode="edit" />
      ) : identity?.confirmed ? (
        <div className="flex justify-end">
          <Link href="/dashboard/academics/settings?identity=edit"
            className="inline-flex min-h-10 items-center rounded-lg border border-border px-4 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
            Edit academy details
          </Link>
        </div>
      ) : null}

      <MasterDataWorkspace key={selectedEntity} data={data} canManage={canManage} initialEntity={selectedEntity} />
    </div>
  );
}
