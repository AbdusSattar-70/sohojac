import {env} from "cloudflare:workers";
import {requirePermission} from "@/modules/platform/auth/erp-context";

/** Original staff-list return contract; only persistence changes to D1. */
export type StaffListRow={
 id:string;staffNo:string;fullName:string;mobile:string|null;email:string|null;
 roleName:string;status:string;joinedOn:string|null;version:number;
 details:{
  alternate_mobile:string|null;address:string|null;
  emergency_contact_name:string|null;emergency_contact_mobile:string|null;
  notes:string|null;profile_id:string|null;branch_id:string|null;left_on:string|null;
 };
};

export async function getStaffList():Promise<StaffListRow[]>{
 await requirePermission("staff.view");
 const result=await env.DB.prepare(
  'SELECT s.id,s.staff_no,s.full_name,s.mobile,s.email,s.status,s.joined_on,'+
  's.alternate_mobile,s.address,s.emergency_contact_name,'+
  's.emergency_contact_mobile,s.notes,s.linked_user_id,s.left_on,s.version,'+
  'm.role FROM academy_staff s LEFT JOIN staff_memberships m '+
  'ON m.user_id=s.linked_user_id ORDER BY s.full_name LIMIT 500'
 ).all<{
  id:string;staff_no:string;full_name:string;mobile:string|null;email:string|null;
  status:string;joined_on:string|null;alternate_mobile:string|null;address:string|null;
  emergency_contact_name:string|null;emergency_contact_mobile:string|null;
  notes:string|null;linked_user_id:string|null;left_on:string|null;
  role:string|null;version:number;
 }>();
 return (result.results??[]).map(r=>({
  id:r.id,staffNo:r.staff_no,fullName:r.full_name,mobile:r.mobile,
  email:r.email,roleName:r.role??"Staff",status:r.status,
  joinedOn:r.joined_on,version:r.version,
  details:{
   alternate_mobile:r.alternate_mobile,address:r.address,
   emergency_contact_name:r.emergency_contact_name,
   emergency_contact_mobile:r.emergency_contact_mobile,
   notes:r.notes,profile_id:r.linked_user_id,
   branch_id:null,left_on:r.left_on
  }
 }));
}
