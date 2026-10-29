import {env} from "cloudflare:workers";
import Link from "next/link";
import {PageHeader} from "@/components/erp/page-header";
import {StatusBadge} from "@/components/erp/status-badge";
import {requirePermission} from "@/modules/platform/auth/erp-context";

export const dynamic="force-dynamic";
type StaffRow={
 id:string;staff_no:string;full_name:string;email:string|null;mobile:string|null;
 joined_on:string|null;status:string;role:string|null;linked_user_id:string|null;
};
export default async function StaffPage(){
 const context=await requirePermission("staff.view");
 const results=await env.DB.prepare(
  "SELECT s.id,s.staff_no,s.full_name,s.email,s.mobile,s.joined_on,s.status,"+
  "s.linked_user_id,m.role FROM academy_staff s "+
  "LEFT JOIN staff_memberships m ON m.user_id=s.linked_user_id "+
  "ORDER BY s.staff_seq DESC LIMIT 500"
 ).all<StaffRow>();
 const staff=results.results??[];
 return <div className="space-y-7">
  <PageHeader eyebrow="People" title="Staff"
   description="Permanent staff identities, responsibilities and verified account links. Staff numbers remain the same across employment changes."/>
  {context.permissions.includes("staff.manage")&&<Link href="/app/staff-directory"
   className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">
   Open staff record management
  </Link>}
  <section className="overflow-x-auto rounded-2xl border bg-card">
   <table className="w-full min-w-[700px] text-sm">
    <thead><tr className="border-b text-left">{["Staff ID / name","Primary responsibility","Contact","Joined","Status / actions"].map(h=>
      <th key={h} scope="col" className="p-4">{h}</th>)}</tr></thead>
    <tbody>{staff.map(row=><tr key={row.id} className="border-b">
     <td className="p-4"><p className="font-semibold">{row.full_name}</p><span className="font-mono" data-testid="staff-number">{row.staff_no}</span></td>
     <td className="p-4">{row.role??"Not assigned"}</td>
     <td className="p-4">{row.mobile??"—"}<p className="text-xs text-muted-foreground">{row.email??"—"}</p></td>
     <td className="p-4">{row.joined_on??"—"}</td>
     <td className="p-4"><StatusBadge value={row.status}/><p className="mt-1 text-xs text-muted-foreground">{row.linked_user_id?"Linked account":"No login"}</p></td>
    </tr>)}</tbody>
   </table>
   {!staff.length&&<p className="p-6 text-sm text-muted-foreground">No staff identity records yet.</p>}
  </section>
  <p className="text-xs text-muted-foreground">Full legacy staff lifecycle and branch-assignment editing will be restored in later migration work.</p>
 </div>;
}
