import {env} from "cloudflare:workers";
import {getStaffAccess,privateJson,sameOrigin} from "@/lib/staff-access";
import {batchPatch} from "@/lib/erp-batches";

export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
type Existing={id:string;name:string;capacity:number;status:"PLANNED"|"ACTIVE"|"COMPLETED"|"CANCELLED";version:number;offering_id:string;begins_on:string|null;ends_on:string|null;enrolled_count:number;};
export async function PATCH(request:Request,context:Context){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(!["OWNER","ADMIN"].includes(staff.role))return privateJson({error:"Access denied"},403);
  if(!sameOrigin(request))return privateJson({error:"Invalid request origin"},403);
  const {id}=await context.params;
  if(!/^[0-9a-f-]{36}$/i.test(id))return privateJson({error:"Invalid batch identifier"},400);
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")){
    return privateJson({error:"JSON required"},415);
  }
  let body:unknown;
  try{
    const raw=await request.text();
    if(raw.length>3000)return privateJson({error:"Request too large"},413);
    body=JSON.parse(raw);
  }catch{return privateJson({error:"Invalid JSON"},400);}
  const parsed=batchPatch.safeParse(body);
  if(!parsed.success)return privateJson({error:"Check batch data, dates and reason"},400);
  const data=parsed.data;
  try{
    const current=await env.DB.prepare([
      "SELECT b.id,b.name,b.capacity,b.status,b.version,b.offering_id,b.begins_on,b.ends_on,",
      "(SELECT COUNT(*) FROM academy_enrollments e WHERE e.batch_id=b.id AND e.status='ACTIVE') AS enrolled_count",
      "FROM academy_batches b WHERE b.id=?"
    ].join(" ")).bind(id).first<Existing>();
    if(!current)return privateJson({error:"Batch not found"},404);
    if(current.version!==data.expectedVersion)return privateJson({error:"Batch changed; refresh and retry"},409);
    if(data.capacity<current.enrolled_count)return privateJson({error:"Capacity cannot be below active enrolments"},409);
    const transitions:Record<string,string[]>={
      PLANNED:["PLANNED","ACTIVE","CANCELLED"],
      ACTIVE:["ACTIVE","COMPLETED"],
      COMPLETED:[],CANCELLED:[],
    };
    if(!transitions[current.status].includes(data.nextStatus)){
      return privateJson({error:"Invalid or irreversible batch status change"},409);
    }
    const result=await env.DB.batch([
      env.DB.prepare([
        "UPDATE academy_batches SET name=?,capacity=?,begins_on=?,ends_on=?,status=?,version=version+1",
        "WHERE id=? AND version=? AND status=?",
        "AND (SELECT COUNT(*) FROM academy_enrollments WHERE batch_id=? AND status='ACTIVE')<=?",
        "AND (?!='ACTIVE' OR EXISTS(SELECT 1 FROM public_programme_offerings",
        "WHERE id=academy_batches.offering_id AND is_active=1))"
      ].join(" ")).bind(data.name,data.capacity,data.beginsOn||null,data.endsOn||null,
        data.nextStatus,id,data.expectedVersion,current.status,id,data.capacity,data.nextStatus),
      env.DB.prepare([
        "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,before_json,after_json)",
        "SELECT ?,'academy_batch',?,'UPDATED',?,?,?,? WHERE changes()=1"
      ].join(" ")).bind(crypto.randomUUID(),id,staff.userId,data.reason,
        JSON.stringify(current),JSON.stringify({...data,version:data.expectedVersion+1})),
    ]);
    if(result[0].meta.changes!==1||result[1].meta.changes!==1){
      return privateJson({error:"Batch changed, offering inactive or capacity exceeded"},409);
    }
    return privateJson({ok:true,status:data.nextStatus,version:data.expectedVersion+1});
  }catch{return privateJson({error:"Could not update batch"},503);}
}
