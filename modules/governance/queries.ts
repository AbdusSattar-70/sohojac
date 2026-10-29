import { env } from "cloudflare:workers";
import { requirePermission } from "@/modules/platform/auth/erp-context";

/** Original governance query API on Cloudflare D1.
 * Display persisted audit events; never synthesize approvals or finance totals.
 * Original schema's full correlation/audit-source crosswalk remains a release gate.
 */
export type AuditRow = {
  id:string;occurred_at:string;actor_profile_id:string|null;
  actor_staff_id:string|null;actor_role_code:string|null;
  actor_name:string|null;actor_staff_no:string|null;
  identity_snapshot:boolean;entity_type:string;entity_id:string;
  action:string;reason:string|null;correlation_id:string;
  before_data:unknown;after_data:unknown;metadata:unknown;
};
export type AuditPageData = {
  rows:Pick<AuditRow,
    "id"|"occurred_at"|"action"|"entity_type"|"entity_id"|"reason"|
    "actor_profile_id"|"actor_name"|"actor_staff_no"|"actor_role_code">[];
  total:number;page:number;pageSize:number;
  activity:{
    date:string;admissions:number|null;invoices:number|null;
    grossIssued:number|null;collected:number|null;refunds:number|null;
  };
};
type EventRow=AuditPageData["rows"][number];

export async function getAuditPage(filters:Record<string,string>):Promise<AuditPageData>{
  await requirePermission("audit.view");
  const requestedPage=Number.parseInt(filters.page??"1",10);
  const page=Number.isSafeInteger(requestedPage)?
    Math.min(100000,Math.max(1,requestedPage)):1;
  const pageSize=50;
  const where:string[]=["1=1"];
  const bindings:(string|number)[]=[];
  const term=(filters.q??"").trim().slice(0,160);
  if(term){
    const fields=[
      "a.entity_type","a.entity_id","a.action","a.reason",
      "u.name","u.email","m.role","s.staff_no"
    ];
    where.push("("+fields.map(field=>
      "instr(lower(COALESCE("+field+",'')),lower(?))>0"
    ).join(" OR ")+")");
    bindings.push(...fields.map(()=>term));
  }
  const entity=(filters.entity??"").trim().slice(0,80);
  if(entity){
    where.push("lower(a.entity_type)=lower(?)");
    bindings.push(entity);
  }
  const action=(filters.action??"").trim().slice(0,80);
  if(action){
    where.push("instr(lower(a.action),lower(?))>0");
    bindings.push(action);
  }
  if(filters.preset==="invoices" && !entity){
    where.push("lower(a.entity_type)='invoice'");
  }
  const isoDate=/^\d{4}-\d{2}-\d{2}$/;
  const from=filters.from, to=filters.to;
  if(from&&isoDate.test(from)){
    where.push("date(a.occurred_at,'+6 hours')>=?");
    bindings.push(from);
  }
  if(to&&isoDate.test(to)){
    where.push("date(a.occurred_at,'+6 hours')<=?");
    bindings.push(to);
  }
  const joins=[
    "FROM erp_audit_events a",
    "LEFT JOIN \"user\" u ON u.id=a.actor_id",
    "LEFT JOIN academy_staff s ON s.linked_user_id=a.actor_id",
    "LEFT JOIN staff_memberships m ON m.user_id=a.actor_id",
  ].join(" ");
  const constraints=" WHERE "+where.join(" AND ");
  const [results,total]=await Promise.all([
    env.DB.prepare(
      "SELECT a.id,a.occurred_at,a.action,a.entity_type,a.entity_id,a.reason,"+
      "a.actor_id AS actor_profile_id,u.name AS actor_name,"+
      "s.staff_no AS actor_staff_no,m.role AS actor_role_code "+
      joins+constraints+
      " ORDER BY a.occurred_at DESC,a.id DESC LIMIT ? OFFSET ?"
    ).bind(...bindings,pageSize,(page-1)*pageSize).all<EventRow>(),
    env.DB.prepare("SELECT COUNT(*) AS n "+joins+constraints)
      .bind(...bindings).first<{n:number}>()
  ]);
  const date=new Date(Date.now()+6*60*60*1000).toISOString().slice(0,10);
  return {
    rows:results.results??[],total:total?.n??0,page,pageSize,
    activity:{date,admissions:null,invoices:null,grossIssued:null,collected:null,refunds:null}
  };
}
