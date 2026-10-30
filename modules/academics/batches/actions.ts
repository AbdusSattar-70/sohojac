"use server";
import {env} from "cloudflare:workers";
import {headers} from "next/headers";
import {revalidatePath} from "next/cache";
import {getErpContext} from "@/modules/platform/auth/erp-context";
import {commandSchema} from "@/modules/admissions/schema";
import {runBatchCommand,type BatchActor,type BatchOutcome} from "./commands";
import {z} from "zod";
type Outcome=Pick<BatchOutcome,"ok"|"message"|"field"|"entityId">;
async function actor():Promise<BatchActor|null>{
 const context=await getErpContext();if(!context)return null;
 const h=await headers();
 try{if(!h.get("origin")||!h.get("host")||new URL(h.get("origin")!).host.toLowerCase()!==h.get("host")!.toLowerCase())return null;}catch{return null;}
 return {profileId:context.profileId,permissions:context.permissions};
}
function refresh(){for(const p of ["/dashboard/academics/batches","/dashboard/academics/offerings","/dashboard/admissions","/dashboard/governance/audit","/"])revalidatePath(p);}
export async function runAcademicBatchCommand(input:unknown):Promise<Outcome>{
 const p=commandSchema.safeParse(input);if(!p.success)return {ok:false,message:p.error.issues[0]?.message??"Check the batch fields."};
 const v=p.data;if(v.action!=="CREATE_BATCH"&&v.action!=="EDIT_BATCH")return {ok:false,message:"Use the dedicated workflow for this command."};
 const context=await actor();if(!context)return {ok:false,message:"Academic management permission and a same-origin request are required."};
 const shared={action:v.action,requestId:v.requestId,reason:v.reason,code:v.code,name:v.name,capacity:v.capacity};
 const result=await runBatchCommand(env.DB,context,v.action==="CREATE_BATCH"?{...shared,offeringId:v.offeringId}:{...shared,batchId:v.batchId,expectedVersion:v.expectedVersion});
 if(result.ok)refresh();return result;
}
const stateInput=z.object({entity:z.literal("batch"),id:z.string().uuid(),active:z.boolean(),
 requestId:z.string().uuid(),expectedVersion:z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),reason:z.string().trim().min(5).max(500)}).strict();
export async function changeRecordState(input:unknown):Promise<Outcome>{
 const p=stateInput.safeParse(input);if(!p.success)return {ok:false,message:"Refresh the batch, then check the lifecycle reason."};
 const context=await actor();if(!context)return {ok:false,message:"Academic management permission and a same-origin request are required."};
 const v=p.data,result=await runBatchCommand(env.DB,context,{action:"SET_BATCH_STATE",batchId:v.id,requestId:v.requestId,
  expectedVersion:v.expectedVersion,reason:v.reason,nextStatus:v.active?"ACTIVE":"PLANNED"});
 if(result.ok)refresh();return result;
}
