import {env} from "cloudflare:workers";
import {privateJson,sameOrigin} from "@/lib/staff-access";
import {getCommandAccess} from "@/modules/platform/auth/command-access";
import {batchPatch} from "@/lib/erp-batches";
import {runBatchCommand} from "@/modules/academics/batches/commands";
import {parseBatchBody,batchRequestIdentity} from "@/modules/academics/batches/http";

export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
export async function PATCH(request:Request,context:Context){
 const staff=await getCommandAccess(request);
 if(!staff)return privateJson({error:"Authentication required"},401);
 if(!staff.permissions.includes("academics.manage"))return privateJson({error:"Academic management permission required"},403);
 if(!sameOrigin(request))return privateJson({error:"Invalid request origin"},403);
 const {id}=await context.params;
 if(!/^[0-9a-f-]{36}$/i.test(id))return privateJson({error:"Invalid batch identifier"},400);
 const body=await parseBatchBody(request);if(body.status!==200)return privateJson({error:"Invalid JSON request"},body.status);
 const parsed=batchPatch.safeParse(body.body);if(!parsed.success)return privateJson({error:"Check batch data, dates and reason"},400);
 const requestId=batchRequestIdentity(request,parsed.data.requestId);
 if(!requestId)return privateJson({error:"Provide a UUID requestId or Idempotency-Key and reuse it when retrying this batch command."},400);
 const result=await runBatchCommand(env.DB,staff,{...parsed.data,action:"EDIT_BATCH",batchId:id,requestId});
 return result.ok?privateJson({ok:true,status:result.status,version:result.version}):privateJson({error:result.message},result.httpStatus);
}
