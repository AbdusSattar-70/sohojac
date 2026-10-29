import {env} from "cloudflare:workers";
import {can,type ErpContext} from "@/types/erp";

/**
 * Cloudflare D1 replacement for the original modules/dashboard/queries.ts.
 * Return the ORIGINAL DashboardOverview interface and preserve real ACL
 * semantics. Do not fabricate missing approvals/follow-up records as zero.
 */
export type DashboardOverview={
 activeProspects:number|null;
 activeStudents:number|null;
 activeStaff:number|null;
 pendingApprovals:number|null;
 dueFollowups:number|null;
 recentProspects:Array<{id:string;prospectNo:string;studentName:string;status:string;createdAt:string}>;
};
async function count(sql:string):Promise<number>{
 const row=await env.DB.prepare(sql).first<{n:number}>();
 if(!row||typeof row.n!=="number")throw new Error("Governed dashboard count unavailable");
 return row.n;
}
export async function getDashboardOverview(context:ErpContext):Promise<DashboardOverview>{
 let activeProspects:number|null=null;
 let activeStudents:number|null=null;
 let activeStaff:number|null=null;
 // No matching production D1 governance approvals or CRM follow-up model
 // has been migrated yet. Null intentionally hides these unknown counts.
 const pendingApprovals:number|null=null;
 const dueFollowups:number|null=null;
 let recentProspects:DashboardOverview["recentProspects"]=[];
 if(can(context,"crm.prospects.view")){
  activeProspects=await count(
   "SELECT COUNT(*) AS n FROM public_enquiries WHERE status IN ('NEW','CONTACTED')"
  );
  const recent=await env.DB.prepare(
   "SELECT id,reference,student_name,status,submitted_at "+
   "FROM public_enquiries ORDER BY submitted_at DESC LIMIT 6"
  ).all<{id:string;reference:string;student_name:string;status:string;submitted_at:string}>();
  recentProspects=(recent.results??[]).map(x=>({
   id:x.id,prospectNo:x.reference,studentName:x.student_name,
   status:x.status,createdAt:x.submitted_at
  }));
 }
 if(can(context,"students.view")){
  activeStudents=await count(
   "SELECT COUNT(DISTINCT s.id) AS n FROM academy_students s "+
   "JOIN academy_enrollments e ON e.student_id=s.id "+
   "WHERE s.status='ACTIVE' AND e.status='ACTIVE'"
  );
 }
 if(can(context,"staff.view")){
  activeStaff=await count(
   "SELECT COUNT(*) AS n FROM academy_staff WHERE status IN ('ACTIVE','ON_LEAVE')"
  );
 }
 return {activeProspects,activeStudents,activeStaff,pendingApprovals,dueFollowups,recentProspects};
}
