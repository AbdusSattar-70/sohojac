import {env} from "cloudflare:workers";
import {getStaffAccess,privateJson,sameOrigin} from "@/lib/staff-access";
import {createOfferingSchema,type StaffOffering} from "@/lib/erp-offerings";

export const dynamic="force-dynamic";

export async function GET(request:Request){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  try{
    const offerings=await env.DB.prepare(`SELECT id,code,name,class_name,
      academic_year_name,branch_name,group_name,showcase_title,showcase_title_bn,
      showcase_description,showcase_description_bn,public_schedule,public_schedule_bn,
      show_on_website,is_active,is_accepting_applications,application_state,
      showcase_sort_order,version,active_batch_count,current_open_seats,current_total_seats
      FROM public_programme_offerings ORDER BY showcase_sort_order,created_at DESC LIMIT 100`)
      .all<StaffOffering>();
    return privateJson({
      items:offerings.results??[],canEdit:["OWNER","ADMIN"].includes(staff.role),
    });
  }catch{return privateJson({error:"Programme catalogue unavailable"},503);}
}

export async function POST(request:Request){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(!["OWNER","ADMIN"].includes(staff.role))return privateJson({error:"Access denied"},403);
  if(!sameOrigin(request))return privateJson({error:"Invalid request origin"},403);
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")){
    return privateJson({error:"JSON required"},415);
  }
  let body:unknown;
  try{
    const raw=await request.text();
    if(raw.length>3500)return privateJson({error:"Request too large"},413);
    body=JSON.parse(raw);
  }catch{return privateJson({error:"Invalid JSON"},400);}
  const parsed=createOfferingSchema.safeParse(body);
  if(!parsed.success)return privateJson({error:"Check required programme fields"},400);
  const data=parsed.data,id=crypto.randomUUID();
  try{
    await env.DB.batch([
      // New offerings start unpublished, inactive and closed until reviewed.
      env.DB.prepare(`INSERT INTO public_programme_offerings
        (id,code,name,class_name,academic_year_name,branch_name,group_name,
          show_on_website,is_active,is_accepting_applications,application_state)
        VALUES (?,?,?,?,?,?,?,0,0,0,'CLOSED')`)
        .bind(id,data.code,data.name,data.className,data.academicYearName,
          data.branchName,data.groupName||null),
      env.DB.prepare(`INSERT INTO erp_audit_events
        (id,entity_type,entity_id,action,actor_id,reason,after_json)
        VALUES (?,'programme_offering',?,'CREATED',?,?,?)`)
        .bind(crypto.randomUUID(),id,staff.userId,data.reason,
          JSON.stringify({...data,applicationState:"CLOSED",isActive:false,showOnWebsite:false})),
    ]);
    return privateJson({ok:true,id,status:"CLOSED",published:false},201);
  }catch{
    return privateJson({error:"Could not create offering; check its unique code"},409);
  }
}
