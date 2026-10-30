"use server";
import {env} from "cloudflare:workers";
import {headers} from "next/headers";
import {revalidatePath} from "next/cache";
import {getErpContext} from "@/modules/platform/auth/erp-context";
import {commandSchema} from "@/modules/admissions/schema";
import {z} from "zod";
import {batchOfferingReadySql} from "@/lib/academic-offering-readiness";
type Outcome={ok:boolean;message:string;field?:string;entityId?:string};
async function actor(){
 const context=await getErpContext();if(!context?.permissions.includes("academics.manage"))return null;
 const h=await headers();
 try{if(!h.get("origin")||!h.get("host")||new URL(h.get("origin")!).host.toLowerCase()!==h.get("host")!.toLowerCase())return null;}catch{return null;}
 return context.profileId;
}
function refresh(){for(const p of ["/dashboard/academics/batches","/dashboard/academics/offerings","/dashboard/admissions","/dashboard/governance/audit","/"])revalidatePath(p);}
async function replay(requestId:string,user:string,command:string,payload:string):Promise<Outcome|null>{
 const row=await env.DB.prepare("SELECT actor_id,command,payload_json,entity_id FROM academy_offering_command_keys WHERE request_id=?").bind(requestId).first<{actor_id:string;command:string;payload_json:string;entity_id:string}>();
 if(!row)return null;
 return row.actor_id===user&&row.command===command&&row.payload_json===payload?{ok:true,message:"Previously saved batch command recovered.",entityId:row.entity_id}:{ok:false,message:"This request identity belongs to different input."};
}
export async function runAcademicBatchCommand(input:unknown):Promise<Outcome>{
 const p=commandSchema.safeParse(input);if(!p.success)return {ok:false,message:p.error.issues[0]?.message??"Check the batch fields."};
 const v=p.data;if(v.action!=="CREATE_BATCH"&&v.action!=="EDIT_BATCH")return {ok:false,message:"Use the dedicated workflow for this command."};
 const user=await actor();if(!user)return {ok:false,message:"Academic management permission and a same-origin request are required."};
 if(!v.code||!/^([A-Za-z0-9_-]){2,40}$/.test(v.code)||!v.name||v.name.length<2)return {ok:false,message:"Enter a valid batch code and name."};
 if(!v.capacity||v.capacity>12)return {ok:false,message:"Batch capacity must be between 1 and the current policy limit of 12.",field:"capacity"};
 const payload=JSON.stringify(v),command=v.action,prev=await replay(v.requestId,user,command,payload);if(prev)return prev;
 if(v.action==="CREATE_BATCH") {
  const ready=await env.DB.prepare("SELECT o.id FROM public_programme_offerings o WHERE o.id=? AND "+batchOfferingReadySql).bind(v.offeringId!).first();
  if(!ready)return {ok:false,field:"offeringId",message:"Choose an active offering with a published current Fee Plan. Open Fee Plans to publish tuition and activate the draft before creating a batch."};
 }
 const id=v.action==="CREATE_BATCH"?crypto.randomUUID():v.batchId!;
 let old:unknown=null;
 if(v.action==="EDIT_BATCH"){
  old=await env.DB.prepare("SELECT id,code,name,capacity,status,version,offering_id FROM academy_batches WHERE id=?").bind(id).first();
  if(!old)return {ok:false,message:"Batch not found."};
  if(v.expectedVersion===undefined)return {ok:false,message:"Refresh the batch before editing."};
 }
 try{
  const mutate=v.action==="CREATE_BATCH"?
   env.DB.prepare([
    "INSERT INTO academy_batches(id,code,name,offering_id,year_id,capacity,status)",
    "SELECT ?,upper(?),?,o.id,o.academic_year_id,?,'ACTIVE' FROM public_programme_offerings o",
    "WHERE o.id=? AND "+batchOfferingReadySql+" RETURNING id"
   ].join(" ")).bind(id,v.code,v.name,v.capacity,v.offeringId!):
   env.DB.prepare([
    "UPDATE academy_batches SET code=upper(?),name=?,capacity=?,version=version+1",
    "WHERE id=? AND version=? AND status IN ('PLANNED','ACTIVE')",
    "AND (SELECT COUNT(*) FROM academy_enrollments e WHERE e.batch_id=academy_batches.id AND e.status='ACTIVE')<=? RETURNING id"
   ].join(" ")).bind(v.code,v.name,v.capacity,id,v.expectedVersion!,v.capacity);
  const tx=await env.DB.batch([
   mutate,
   env.DB.prepare("INSERT INTO academy_offering_command_keys(request_id,actor_id,command,payload_json,entity_id) SELECT ?,?,?,?,? WHERE changes()=1 RETURNING request_id").bind(v.requestId,user,command,payload,id),
   env.DB.prepare("INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,before_json,after_json) SELECT ?,'academy_batch',?,?,?,?,?,? FROM academy_offering_command_keys WHERE request_id=? AND actor_id=? AND entity_id=? AND command=? AND payload_json=? RETURNING id").bind(v.requestId,id,command,user,v.reason,old===null?null:JSON.stringify(old),payload,v.requestId,user,id,command,payload)
  ]);
  if(tx.some(r=>r.results?.length!==1))return {ok:false,message:"Batch, capacity or offering terms changed. Refresh before retrying."};
  refresh();return {ok:true,message:v.action==="CREATE_BATCH"?"Batch created with its verified offering context.":"Batch updated; historical placement and offering remain attached.",entityId:id};
 }catch{const done=await replay(v.requestId,user,command,payload);return done??{ok:false,message:"Batch was not saved. Check its unique code, capacity and current state."};}
}
const stateInput=z.object({entity:z.literal("batch"),id:z.string().uuid(),active:z.boolean(),reason:z.string().trim().min(5).max(500)});
export async function changeRecordState(input:unknown):Promise<Outcome>{
 const p=stateInput.safeParse(input);if(!p.success)return {ok:false,message:"Check the batch and lifecycle reason."};
 const user=await actor();if(!user)return {ok:false,message:"Academic management permission required."};
 const v=p.data,old=await env.DB.prepare("SELECT id,status,version FROM academy_batches WHERE id=?").bind(v.id).first<{id:string;status:string;version:number}>();
 if(!old)return {ok:false,message:"Batch not found."};
 if(!["ACTIVE","PLANNED"].includes(old.status))return {ok:false,message:"Completed or cancelled historical batches cannot reopen."};
 try{
  const tx=await env.DB.batch([
   env.DB.prepare([
    "UPDATE academy_batches SET status=?,version=version+1 WHERE id=? AND version=? AND status IN ('ACTIVE','PLANNED')",
    "AND (?=0 OR EXISTS(SELECT 1 FROM public_programme_offerings o WHERE o.id=academy_batches.offering_id AND "+batchOfferingReadySql+")) RETURNING id"
   ].join(" ")).bind(v.active?"ACTIVE":"PLANNED",v.id,old.version,v.active?1:0),
   env.DB.prepare("INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,before_json,after_json) SELECT ?,'academy_batch',?,?,?,?,?,? WHERE changes()=1 RETURNING id").bind(crypto.randomUUID(),v.id,v.active?"REACTIVATE":"MARK_INACTIVE",user,v.reason,JSON.stringify(old),JSON.stringify({status:v.active?"ACTIVE":"PLANNED"}))
  ]);
  if(tx.some(r=>r.results?.length!==1))return {ok:false,message:"Batch changed or has no active offering and current fee plan."};
  refresh();return {ok:true,message:v.active?"Batch reactivated.":"Batch marked inactive; enrollment history is retained."};
 }catch{return {ok:false,message:"Batch lifecycle update failed. Refresh before retrying."};}
}
