import {env} from "cloudflare:workers";
import {requirePermission} from "@/modules/platform/auth/erp-context";

type AccessRow={
 id:string;full_name:string;email:string;mobile:string;requested_role:string;
 purpose:string;status:string;assigned_role:string|null;
};
export async function getStaffAccessRequestPage({page,history}:{page:number;history:boolean}){
 await requirePermission("system.users.manage");
 const statuses=history?["ACTIVE","DECLINED"]:["PENDING","VERIFIED","INVITED"];
 const [rows,total]=await Promise.all([
  env.DB.prepare(
   "SELECT id,full_name,email,mobile,requested_role,purpose,status,assigned_role "+
   "FROM staff_access_requests WHERE status IN ("+(history?"?,?":"?,?,?")+") "+
   "ORDER BY created_at DESC,id DESC LIMIT 25 OFFSET ?"
  ).bind(...statuses,(page-1)*25).all<AccessRow>(),
  env.DB.prepare(
   "SELECT COUNT(*) AS total FROM staff_access_requests WHERE status IN ("+
   (history?"?,?":"?,?,?")+")"
  ).bind(...statuses).first<{total:number}>()
 ]);
 return {data:rows.results??[],count:total?.total??0,error:null};
}
