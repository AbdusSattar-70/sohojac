import {env} from "cloudflare:workers";
import {UserRoundSearch,GraduationCap,UsersRound,ClipboardCheck} from "lucide-react";
import {PageHeader} from "@/components/erp/page-header";
import {StatCard} from "@/components/erp/stat-card";
import {requirePermission} from "@/modules/platform/auth/erp-context";

export const dynamic="force-dynamic";
export default async function DashboardPage({searchParams}:{searchParams:Promise<{access?:string}>}){
 const context=await requirePermission("dashboard.view");
 const {access}=await searchParams;
 // Query only governed production records. Deny on DB errors rather than invent zero counts.
 const count=async(sql:string):Promise<number|string>=>{
  try{const result=await env.DB.prepare(sql).first<{total:number}>();
   return result?Number(result.total):"—";
  }catch{return "—";}
 };
 const cards: Array<{label:string;value:number|string;description:string;icon:typeof UserRoundSearch}> =[];
 if(context.permissions.includes("crm.prospects.view")){
  cards.push({label:"Active prospects",value:await count(
   "SELECT COUNT(*) AS total FROM public_enquiries WHERE status IN ('NEW','CONTACTED')"),
   description:"Open applications from public interest registrations",icon:UserRoundSearch});
 }
 if(context.permissions.includes("students.view")){
  cards.push({label:"Active students",value:await count(
   "SELECT COUNT(*) AS total FROM academy_students WHERE status='ACTIVE'"),
   description:"Active Student Master records",icon:GraduationCap});
 }
 if(context.permissions.includes("staff.view")){
  cards.push({label:"Active staff",value:await count(
   "SELECT COUNT(*) AS total FROM staff_memberships WHERE active=1"),
   description:"Verified active staff memberships",icon:UsersRound});
 }
 if(context.permissions.includes("approvals.view")){
  cards.push({label:"Pending reviews",value:await count(
   "SELECT COUNT(*) AS total FROM staff_access_requests WHERE status='PENDING'"),
   description:"Staff requests awaiting authorization",icon:ClipboardCheck});
 }
 return <div className="space-y-7">
  <PageHeader eyebrow="Operational overview" title="Digital Campus"
   description="A concise view of work that needs attention. Counts are read from the current Cloudflare D1 database."/>
  {access==="denied"&&<p role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
    The requested module is outside your current permissions. No data was exposed or changed.
   </p>}
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
   {cards.map(card=><StatCard key={card.label} {...card}/>)}
  </div>
  <p className="text-sm text-muted-foreground">Other original Sohoj Academy workflows are not yet verified on D1. This dashboard is a migration preview, not the final ERP.</p>
 </div>;
}
