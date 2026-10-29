import {PageHeader} from "@/components/erp/page-header";
import {requireErpContext} from "@/modules/platform/auth/erp-context";
export const dynamic="force-dynamic";
export default async function AccountPage(){
 const context=await requireErpContext();
 return <div className="space-y-6">
  <PageHeader eyebrow="Account & access" title="My account"
   description="Authenticated Sohoj Academy staff identity and permission scope."/>
  <section className="rounded-xl border bg-card p-5">
   <dl className="grid gap-4 text-sm sm:grid-cols-2">
    <div><dt className="text-muted-foreground">Name</dt><dd className="font-semibold">{context.displayName}</dd></div>
    <div><dt className="text-muted-foreground">Email</dt><dd className="font-semibold">{context.email}</dd></div>
    <div><dt className="text-muted-foreground">Role</dt><dd>{context.roles.join(", ")}</dd></div>
    <div><dt className="text-muted-foreground">Account status</dt><dd>{context.status}</dd></div>
   </dl>
  </section>
 </div>;
}
