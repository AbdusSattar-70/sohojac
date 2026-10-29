import {env} from "cloudflare:workers";
import {getStaffAccess,privateJson} from "@/lib/staff-access";
export const dynamic="force-dynamic";
type Entry={id:string;entity_type:string;entity_id:string;action:string;
  actor_name:string|null;reason:string;occurred_at:string};
export async function GET(request:Request){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(!["OWNER","ADMIN"].includes(staff.role))return privateJson({error:"Access denied"},403);
  const params=new URL(request.url).searchParams;
  const pageInput=params.get("page")||"1",type=params.get("type")||"ALL";
  if(!/^[1-9][0-9]{0,2}$/.test(pageInput)||Number(pageInput)>100||
    (type!=="ALL"&&!/^[a-z_]{3,50}$/.test(type))){
    return privateJson({error:"Invalid audit filter"},400);
  }
  try{
    const filtered=type==="ALL"?"":"WHERE e.entity_type=?";
    const query=[
      "SELECT e.id,e.entity_type,e.entity_id,e.action,",
      "u.name AS actor_name,e.reason,e.occurred_at",
      "FROM erp_audit_events e LEFT JOIN \"user\" u ON u.id=e.actor_id",
      filtered,"ORDER BY e.occurred_at DESC,e.id DESC LIMIT 51 OFFSET ?"
    ].join(" ");
    const args=type==="ALL"?[(Number(pageInput)-1)*50]:[type,(Number(pageInput)-1)*50];
    const rows=await env.DB.prepare(query).bind(...args).all<Entry>();
    const entries=rows.results??[];
    const types=await env.DB.prepare([
      "SELECT entity_type,COUNT(*) AS total FROM erp_audit_events",
      "GROUP BY entity_type ORDER BY entity_type LIMIT 100"
    ].join(" ")).all<{entity_type:string;total:number}>();
    return privateJson({items:entries.slice(0,50),hasMore:entries.length>50,
      types:types.results??[],page:Number(pageInput)});
  }catch{return privateJson({error:"Audit history unavailable"},503);}
}
