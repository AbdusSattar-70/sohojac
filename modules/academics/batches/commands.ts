import {batchCommandSchema,type BatchCommand,type BatchStatus} from "@/lib/erp-batches";
import {batchOfferingReadySql} from "@/lib/academic-offering-readiness";

export type BatchActor={profileId:string;permissions:readonly string[]};
export type BatchOutcome={ok:boolean;message:string;httpStatus:number;field?:string;entityId?:string;status?:BatchStatus;version?:number;replayed?:boolean};
type Existing={id:string;code:string;name:string;capacity:number;status:BatchStatus;version:number;offering_id:string;year_id:string|null;begins_on:string|null;ends_on:string|null;enrolled_count:number};
const transitions:Record<BatchStatus,readonly BatchStatus[]>={
 PLANNED:["PLANNED","ACTIVE","CANCELLED"],ACTIVE:["ACTIVE","PLANNED","COMPLETED"],COMPLETED:[],CANCELLED:[],
};
const fail=(message:string,httpStatus=409,field?:string):BatchOutcome=>({ok:false,message,httpStatus,...(field?{field}:{})});
function success(v:BatchCommand,id:string,replayed=false):BatchOutcome{
 return {ok:true,httpStatus:v.action==="CREATE_BATCH"?201:200,
  message:replayed?"Previously saved batch command recovered.":v.action==="CREATE_BATCH"?"Batch created with its verified offering context.":"Batch updated; historical placement and offering remain attached.",
  entityId:id,version:v.action==="CREATE_BATCH"?1:v.expectedVersion+1,
  ...(v.nextStatus?{status:v.nextStatus}:{}),...(replayed?{replayed:true}:{})};
}
async function replay(db:D1Database,user:string,v:BatchCommand,payload:string):Promise<BatchOutcome|null>{
 const row=await db.prepare("SELECT actor_id,command,payload_json,entity_id FROM academy_offering_command_keys WHERE request_id=?").bind(v.requestId).first<{actor_id:string;command:string;payload_json:string;entity_id:string}>();
 if(!row)return null;
 return row.actor_id===user&&row.command===v.action&&row.payload_json===payload?success(v,row.entity_id,true):fail("This request identity belongs to different input or another operator.");
}

/** The sole batch writer. D1 batch commits the mutation, retry identity and audit together. */
export async function runBatchCommand(db:D1Database,actor:BatchActor|null,input:unknown):Promise<BatchOutcome>{
 if(!actor)return fail("Authentication required",401);
 if(!actor.permissions.includes("academics.manage"))return fail("Academic management permission required.",403);
 const parsed=batchCommandSchema.safeParse(input);
 if(!parsed.success)return fail(parsed.error.issues[0]?.message??"Check the batch fields.",400,parsed.error.issues[0]?.path[0]?.toString());
 const v=parsed.data,user=actor.profileId,payload=JSON.stringify(v);
 try{
  const previous=await replay(db,user,v,payload);if(previous)return previous;
  let old:Existing|null=null;
  if(v.action!=="CREATE_BATCH"){
   old=await db.prepare([
    "SELECT b.id,b.code,b.name,b.capacity,b.status,b.version,b.offering_id,b.year_id,b.begins_on,b.ends_on,",
    "(SELECT COUNT(*) FROM academy_enrollments e WHERE e.batch_id=b.id AND e.status='ACTIVE') AS enrolled_count",
    "FROM academy_batches b WHERE b.id=?",
   ].join(" ")).bind(v.batchId).first<Existing>();
   if(!old)return fail("Batch not found.",404);
   if(old.version!==v.expectedVersion)return await replay(db,user,v,payload)??fail("Batch changed; refresh and retry.");
   const nextStatus=v.nextStatus??old.status;
   if(!transitions[old.status].includes(nextStatus))return fail("Completed or cancelled historical batches cannot reopen or change.");
   if(v.action==="EDIT_BATCH"&&v.capacity<old.enrolled_count)return fail("Capacity cannot be below active enrolments.",409,"capacity");
   const begins=v.action==="EDIT_BATCH"?(v.beginsOn??old.begins_on):old.begins_on;
   const ends=v.action==="EDIT_BATCH"?(v.endsOn??old.ends_on):old.ends_on;
   if(begins&&ends&&begins>ends)return fail("End date cannot precede start date.",400);
  }
  const id=v.action==="CREATE_BATCH"?crypto.randomUUID():v.batchId;
  let mutate:D1PreparedStatement;
  if(v.action==="CREATE_BATCH"){
   mutate=db.prepare([
    "INSERT INTO academy_batches(id,code,name,offering_id,year_id,capacity,begins_on,ends_on,status)",
    "SELECT ?,?,?,o.id,o.academic_year_id,?,?,?,? FROM public_programme_offerings o",
    "WHERE o.id=? AND "+batchOfferingReadySql,
    "AND (?='' OR ?=o.academic_year_id) AND ? BETWEEN 1 AND 12 RETURNING id",
   ].join(" ")).bind(id,v.code,v.name,v.capacity,v.beginsOn||null,v.endsOn||null,v.nextStatus,v.offeringId,v.yearId,v.yearId,v.capacity);
  }else{
   const current=old!,editing=v.action==="EDIT_BATCH",nextStatus=v.nextStatus??current.status;
   const nextCapacity=editing?v.capacity:current.capacity;
   mutate=db.prepare([
    "UPDATE academy_batches SET code=?,name=?,capacity=?,begins_on=?,ends_on=?,status=?,version=version+1",
    "WHERE id=? AND version=? AND status=? AND ? BETWEEN 1 AND 12",
    "AND (SELECT COUNT(*) FROM academy_enrollments e WHERE e.batch_id=academy_batches.id AND e.status='ACTIVE')<=?",
    "AND (?!='ACTIVE' OR EXISTS(SELECT 1 FROM public_programme_offerings o WHERE o.id=academy_batches.offering_id AND "+batchOfferingReadySql+")) RETURNING id",
   ].join(" ")).bind(editing?(v.code??current.code):current.code,editing?v.name:current.name,nextCapacity,
     editing?(v.beginsOn===undefined?current.begins_on:v.beginsOn||null):current.begins_on,
     editing?(v.endsOn===undefined?current.ends_on:v.endsOn||null):current.ends_on,nextStatus,
     id,v.expectedVersion,current.status,nextCapacity,nextCapacity,nextStatus);
  }
  const tx=await db.batch([
   mutate,
   db.prepare("INSERT INTO academy_offering_command_keys(request_id,actor_id,command,payload_json,entity_id) SELECT ?,?,?,?,? WHERE changes()=1 RETURNING request_id").bind(v.requestId,user,v.action,payload,id),
   db.prepare("INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,before_json,after_json) SELECT ?,'academy_batch',?,?,?,?,?,? WHERE changes()=1 RETURNING id").bind(v.requestId,id,v.action,user,v.reason,old?JSON.stringify(old):null,payload),
  ]);
  if(tx.some(row=>row.results?.length!==1))return await replay(db,user,v,payload)??fail("Batch, capacity or offering terms changed. Choose an active offering with a published current Fee Plan, then refresh before retrying.",409,v.action==="CREATE_BATCH"?"offeringId":undefined);
  return {...success(v,id),status:v.nextStatus??old?.status};
 }catch{
  try{return await replay(db,user,v,payload)??fail("Batch was not saved. Check its unique code, capacity and current state.");}
  catch{return fail("Batch service unavailable. Retry with the same request identity.",503);}
 }
}
