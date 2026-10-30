import {env} from "cloudflare:workers";
import {privateJson,sameOrigin} from "@/lib/staff-access";
import {getCommandAccess} from "@/modules/platform/auth/command-access";
import {batchCreate,type BatchRow} from "@/lib/erp-batches";
import {batchOfferingReadySql} from "@/lib/academic-offering-readiness";
import {runBatchCommand} from "@/modules/academics/batches/commands";
import {parseBatchBody,batchRequestIdentity} from "@/modules/academics/batches/http";

export const dynamic="force-dynamic";
export async function GET(request:Request){
 const staff=await getCommandAccess(request);
 if(!staff)return privateJson({error:"Authentication required"},401);
 if(!staff.permissions.includes("academics.view"))return privateJson({error:"Academic viewing permission required"},403);
 try{
  const [batches,offerings,years]=await Promise.all([
   env.DB.prepare([
    "SELECT b.id,b.code,b.name,b.offering_id,p.name AS offering_name,",
    "b.year_id,y.title AS year_title,b.capacity,b.begins_on,b.ends_on,b.status,b.version,",
    "(SELECT COUNT(*) FROM academy_enrollments e WHERE e.batch_id=b.id AND e.status='ACTIVE') AS enrolled_count",
    "FROM academy_batches b JOIN public_programme_offerings p ON p.id=b.offering_id",
    "LEFT JOIN academic_years y ON y.id=b.year_id",
    "ORDER BY CASE b.status WHEN 'ACTIVE' THEN 0 WHEN 'PLANNED' THEN 1 ELSE 2 END,b.created_at DESC LIMIT 150",
   ].join(" ")).all<BatchRow>(),
   env.DB.prepare("SELECT o.id,o.name,o.is_active,1 AS fee_ready FROM public_programme_offerings o WHERE "+batchOfferingReadySql+" ORDER BY o.name LIMIT 150").all<{id:string;name:string;is_active:number;fee_ready:number}>(),
   env.DB.prepare("SELECT id,title,status FROM academic_years WHERE status!='CLOSED' ORDER BY code DESC LIMIT 100").all<{id:string;title:string;status:string}>(),
  ]);
  return privateJson({items:batches.results??[],offerings:offerings.results??[],years:years.results??[],canEdit:staff.permissions.includes("academics.manage")});
 }catch{return privateJson({error:"Batch register unavailable"},503);}
}
export async function POST(request:Request){
 const staff=await getCommandAccess(request);
 if(!staff)return privateJson({error:"Authentication required"},401);
 if(!staff.permissions.includes("academics.manage"))return privateJson({error:"Academic management permission required"},403);
 if(!sameOrigin(request))return privateJson({error:"Invalid request origin"},403);
 const body=await parseBatchBody(request);if(body.status!==200)return privateJson({error:"Invalid JSON request"},body.status);
 const parsed=batchCreate.safeParse(body.body);if(!parsed.success)return privateJson({error:"Check batch details and 12-student maximum"},400);
 const requestId=batchRequestIdentity(request,parsed.data.requestId);
 if(!requestId)return privateJson({error:"Provide a UUID requestId or Idempotency-Key and reuse it when retrying this batch command."},400);
 const result=await runBatchCommand(env.DB,staff,{...parsed.data,action:"CREATE_BATCH",requestId,nextStatus:"PLANNED"});
 return result.ok?privateJson({ok:true,id:result.entityId,status:result.status,version:result.version},result.httpStatus):privateJson({error:result.message},result.httpStatus);
}
