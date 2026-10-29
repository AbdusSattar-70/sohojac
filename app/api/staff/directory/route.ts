import {env} from "cloudflare:workers";
import {z} from "zod";
import {getStaffAccess,privateJson,sameOrigin} from "@/lib/staff-access";

export const dynamic="force-dynamic";
const staffManagers=new Set(["OWNER","ADMIN"]);

const person=z.object({
 fullName:z.string().trim().min(2).max(160),
 email:z.union([z.email().max(254),z.literal("")]).default(""),
 mobile:z.string().trim().max(20).default(""),
 alternateMobile:z.string().trim().max(20).default(""),
 address:z.string().trim().max(600).default(""),
 emergencyContactName:z.string().trim().max(160).default(""),
 emergencyContactMobile:z.string().trim().max(20).default(""),
 joinedOn:z.union([z.iso.date(),z.literal("")]).default(""),
 notes:z.string().trim().max(2000).default(""),
 reason:z.string().trim().min(8).max(500),
}).strict();

export async function GET(request:Request){
 const staff=await getStaffAccess(request.url,request.headers);
 if(!staff)return privateJson({error:"Authentication required"},401);
 if(!staffManagers.has(staff.role))return privateJson({error:"Access denied"},403);
 try{
  const rows=await env.DB.prepare(
   "SELECT s.id,s.staff_no,s.full_name,s.mobile,s.alternate_mobile,s.email,"+
   "s.address,s.emergency_contact_name,s.emergency_contact_mobile,"+
   "s.joined_on,s.left_on,s.status,s.notes,s.linked_user_id,s.version,s.created_at,"+
   "m.role,m.active AS login_active "+
   "FROM academy_staff s LEFT JOIN staff_memberships m ON m.user_id=s.linked_user_id "+
   "ORDER BY s.staff_seq DESC LIMIT 500"
  ).all();
  return privateJson({items:rows.results??[]});
 }catch{return privateJson({error:"Staff register unavailable"},503);}
}

export async function POST(request:Request){
 const staff=await getStaffAccess(request.url,request.headers);
 if(!staff)return privateJson({error:"Authentication required"},401);
 if(!staffManagers.has(staff.role))return privateJson({error:"Access denied"},403);
 if(!sameOrigin(request))return privateJson({error:"Invalid request origin"},403);
 if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
  return privateJson({error:"JSON required"},415);
 let data:unknown;
 try{
  const raw=await request.text();
  if(raw.length>6000)return privateJson({error:"Request too large"},413);
  data=JSON.parse(raw);
 }catch{return privateJson({error:"Invalid JSON"},400);}
 const parsed=person.safeParse(data);
 if(!parsed.success)return privateJson({error:"Check the staff details",field:parsed.error.issues[0]?.path[0]},400);
 const v=parsed.data,id=crypto.randomUUID();
 try{
  const results=await env.DB.batch([
   env.DB.prepare(
    "INSERT INTO academy_staff "+
    "(id,full_name,email,mobile,alternate_mobile,address,emergency_contact_name,"+
    "emergency_contact_mobile,joined_on,notes,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
   ).bind(id,v.fullName,v.email||null,v.mobile||null,v.alternateMobile||null,
    v.address||null,v.emergencyContactName||null,v.emergencyContactMobile||null,
    v.joinedOn||null,v.notes||null,staff.userId),
   env.DB.prepare(
    "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason) "+
    "VALUES (?,'staff',?,'CREATED',?,?)"
   ).bind(crypto.randomUUID(),id,staff.userId,v.reason),
  ]);
  if(results.some(x=>x.meta.changes!==1))
   return privateJson({error:"Staff record could not be confirmed"},503);
  const row=await env.DB.prepare(
    "SELECT id,staff_no,full_name FROM academy_staff WHERE id=?"
  ).bind(id).first<{id:string;staff_no:string;full_name:string}>();
  if(!row)return privateJson({error:"Staff record created but not confirmed; refresh the register"},503);
  return privateJson({item:row,message:"Permanent staff number assigned. No login was created."},201);
 }catch{return privateJson({error:"Could not register staff. Check details and retry after refreshing."},409);}
}
