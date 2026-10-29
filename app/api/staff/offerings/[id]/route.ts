import {env} from "cloudflare:workers";
import {getStaffAccess,privateJson,sameOrigin} from "@/lib/staff-access";
import {offeringUpdateSchema,type StaffOffering} from "@/lib/erp-offerings";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};

export async function PATCH(request:Request,context:Context){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(!["OWNER","ADMIN"].includes(staff.role))return privateJson({error:"Access denied"},403);
  if(!sameOrigin(request))return privateJson({error:"Invalid request origin"},403);
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")){
    return privateJson({error:"JSON required"},415);
  }
  const {id}=await context.params;
  if(!/^[0-9a-f-]{36}$/i.test(id)&&!/^sa-[a-z0-9-]{3,70}$/.test(id)){
    return privateJson({error:"Invalid offering identifier"},400);
  }
  let body:unknown;
  try{
    const raw=await request.text();
    if(raw.length>7000)return privateJson({error:"Request too large"},413);
    body=JSON.parse(raw);
  }catch{return privateJson({error:"Invalid JSON"},400);}
  const parsed=offeringUpdateSchema.safeParse(body);
  if(!parsed.success)return privateJson({error:"Check programme status and required details"},400);
  const data=parsed.data;
  try{
    const current=await env.DB.prepare(`SELECT id,code,name,class_name,academic_year_name,
      branch_name,group_name,showcase_title,showcase_title_bn,
      showcase_description,showcase_description_bn,public_schedule,public_schedule_bn,
      show_on_website,is_active,is_accepting_applications,application_state,
      showcase_sort_order,version,active_batch_count,current_total_seats,current_open_seats
      FROM public_programme_offerings WHERE id=?`)
      .bind(id).first<StaffOffering>();
    if(!current)return privateJson({error:"Offering not found"},404);
    if(current.version!==data.expectedVersion){
      return privateJson({error:"Programme was changed by another staff member. Refresh first."},409);
    }
    const accepting=data.applicationState==="OPEN"&&data.showOnWebsite&&data.isActive;
    const updated={
      ...data,isAcceptingApplications:accepting,version:current.version+1,
    };
    const result=await env.DB.batch([
      env.DB.prepare(`UPDATE public_programme_offerings SET
        name=?,class_name=?,academic_year_name=?,branch_name=?,group_name=?,
        showcase_title=?,showcase_title_bn=?,showcase_description=?,
        showcase_description_bn=?,public_schedule=?,public_schedule_bn=?,
        show_on_website=?,is_active=?,application_state=?,
        is_accepting_applications=?,showcase_sort_order=?,version=version+1
        WHERE id=? AND version=?`)
        .bind(data.name,data.className,data.academicYearName,data.branchName,
          data.groupName||null,data.showcaseTitle||null,data.showcaseTitleBn||null,
          data.showcaseDescription||null,data.showcaseDescriptionBn||null,
          data.publicSchedule||null,data.publicScheduleBn||null,
          data.showOnWebsite?1:0,data.isActive?1:0,data.applicationState,
          accepting?1:0,data.sortOrder,id,data.expectedVersion),
      env.DB.prepare(`INSERT INTO erp_audit_events
        (id,entity_type,entity_id,action,actor_id,reason,before_json,after_json)
        SELECT ?,'programme_offering',?,'UPDATED',?,?,?,? WHERE changes()=1`)
        .bind(crypto.randomUUID(),id,staff.userId,data.reason,
          JSON.stringify(current),JSON.stringify(updated)),
    ]);
    if(result[0].meta.changes!==1||result[1].meta.changes!==1){
      return privateJson({error:"Programme was changed. Refresh and retry."},409);
    }
    return privateJson({ok:true,version:updated.version,isAcceptingApplications:accepting});
  }catch{return privateJson({error:"Could not update programme. Check your data and retry."},503);}
}
