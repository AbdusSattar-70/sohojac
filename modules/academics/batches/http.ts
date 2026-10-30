import {z} from "zod";
const identity=z.string().uuid();
export async function parseBatchBody(request:Request):Promise<{status:number;body:unknown}>{
 if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))return {status:415,body:null};
 try{
  const raw=await request.text();if(raw.length>3000)return {status:413,body:null};
  return {status:200,body:JSON.parse(raw) as unknown};
 }catch{return {status:400,body:null};}
}
export function batchRequestIdentity(request:Request,bodyIdentity?:string):string|null{
 const headerIdentity=request.headers.get("Idempotency-Key")??undefined;
 if(bodyIdentity&&headerIdentity&&bodyIdentity!==headerIdentity)return null;
 const parsed=identity.safeParse(bodyIdentity??headerIdentity);
 return parsed.success?parsed.data:null;
}
