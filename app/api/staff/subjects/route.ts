import {env} from "cloudflare:workers";
import {getStaffAccess,privateJson} from "@/lib/staff-access";
import type {SubjectRow,OfferingSubjectRow} from "@/lib/erp-subjects";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  try{
    const [subjects,offerings,links]=await Promise.all([
      env.DB.prepare([
        "SELECT id,code,name,class_grade,group_name,active,version",
        "FROM academy_subjects ORDER BY class_grade,group_name,name LIMIT 300"
      ].join(" ")).all<SubjectRow>(),
      env.DB.prepare([
        "SELECT id,name,version,subjects_json FROM public_programme_offerings",
        "ORDER BY name LIMIT 100"
      ].join(" ")).all<OfferingSubjectRow>(),
      env.DB.prepare("SELECT offering_id,subject_id FROM academy_offering_subjects LIMIT 1000")
        .all<{offering_id:string;subject_id:string}>(),
    ]);
    return privateJson({items:subjects.results??[],offerings:offerings.results??[],
      links:links.results??[],canEdit:false,legacyReadOnly:true});
  }catch{return privateJson({error:"Subject catalogue unavailable"},503);}
}
/**
 * Legacy subjects have class/stream-specific IDs and are already linked into
 * historical public-card data. No new legacy master rows should be minted.
 * Use the single global academic_subjects master under Academic Settings;
 * existing linked legacy records remain readable until a verified ID cutover.
 */
export async function POST(request:Request) {
  const staff = await getStaffAccess(request.url, request.headers);
  if (!staff) return privateJson({error:"Authentication required"},401);
  if (!["OWNER","ADMIN"].includes(staff.role)) return privateJson({error:"Access denied"},403);
  return privateJson({
    error:"Class-specific subject creation is retired. Create the subject once under Academic Settings → Subjects.",
    action:"/dashboard/academics/settings",
  },410);
}
