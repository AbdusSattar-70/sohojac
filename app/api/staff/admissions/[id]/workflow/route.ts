import {z} from "zod";
import {getStaffAccess,privateJson,sameOrigin} from "@/lib/staff-access";
import {runAdmissionCommand} from "@/modules/admissions/actions";
import {runReferralCommand,receivePhysicalConsent,saveExtraCharge,deactivateExtraCharge,
 saveAdmissionDiscount,finalizeAdmission,collectAdmissionPayment,activateAdmission} from "@/modules/admissions/lifecycle";

export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
const requestSchema=z.object({
 action:z.enum(["READY","RETURN_TO_DRAFT","REFERRAL","CONSENT","EXTRA_CHARGE","DEACTIVATE_CHARGE",
  "DISCOUNT","FINALIZE","PAYMENT","ACTIVATE"]),
 requestId:z.string().uuid().optional(),
 reason:z.string().trim().min(5).max(500),
 source:z.enum(["ORGANIC","REFERRED"]).optional(),
 staffId:z.string().uuid().optional(),referrerId:z.string().uuid().optional(),
 fullName:z.string().optional(),mobile:z.string().optional(),
 relationshipNote:z.string().optional(),contactNote:z.string().optional(),
 guardianSignedOn:z.string().optional(),studentSigned:z.boolean().optional(),
 physicalCopyReference:z.string().optional(),
 name:z.string().optional(),amount:z.number().optional(),
 chargeType:z.enum(["ADMISSION","EXAM","MATERIAL","OTHER"]).optional(),
 chargeId:z.string().uuid().optional(),
 discountPercent:z.number().optional(),discountReason:z.string().optional(),
 method:z.enum(["CASH","BANK","MFS"]).optional(),reference:z.string().optional()
}).strict();
export async function POST(request:Request,context:Context){
 const staff=await getStaffAccess(request.url,request.headers);
 if(!staff)return privateJson({error:"Authentication required"},401);
 if(!["OWNER","ADMIN","OPERATOR"].includes(staff.role))return privateJson({error:"Forbidden"},403);
 if(!sameOrigin(request))return privateJson({error:"Invalid origin"},403);
 if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
  return privateJson({error:"JSON required"},415);
 const {id}=await context.params;
 if(!z.string().uuid().safeParse(id).success)return privateJson({error:"Invalid admission"},400);
 let raw:string;
 try{raw=await request.text();if(raw.length>4096)return privateJson({error:"Request too large"},413);}
 catch{return privateJson({error:"Request could not be read"},400);}
 let input:unknown;
 try{input=JSON.parse(raw);}catch{return privateJson({error:"Invalid JSON"},400);}
 const p=requestSchema.safeParse(input);
 if(!p.success)return privateJson({error:p.error.issues[0]?.message??"Check workflow details"},400);
 const v=p.data;
 const requestId=v.requestId??crypto.randomUUID();
 let result:{ok:boolean;message:string};
 try{
  switch(v.action){
   case "READY":case "RETURN_TO_DRAFT":
    result=await runAdmissionCommand({action:v.action,admissionId:id,requestId,reason:v.reason});break;
   case "REFERRAL":
    result=await runReferralCommand({action:"CAPTURE",admissionId:id,source:v.source,staffId:v.staffId,
     referrerId:v.referrerId,fullName:v.fullName,mobile:v.mobile,relationshipNote:v.relationshipNote,
     contactNote:v.contactNote,reason:v.reason});break;
   case "CONSENT":
    result=await receivePhysicalConsent({admissionId:id,requestId,guardianSignedOn:v.guardianSignedOn,
     studentSigned:v.studentSigned,physicalCopyReference:v.physicalCopyReference,reason:v.reason});break;
   case "EXTRA_CHARGE":
    result=await saveExtraCharge({admission_id:id,request_id:requestId,name:v.name,
     amount:v.amount,charge_type:v.chargeType});break;
   case "DEACTIVATE_CHARGE":
    result=await deactivateExtraCharge(id,v.chargeId??"");break;
   case "DISCOUNT":
    result=await saveAdmissionDiscount({admissionId:id,discountPercent:v.discountPercent,
     discountReason:v.discountReason,reason:v.reason});break;
   case "FINALIZE":
    result=await finalizeAdmission({admissionId:id,requestId,reason:v.reason});break;
   case "PAYMENT":
    result=await collectAdmissionPayment({admissionId:id,requestId,amount:v.amount,
     method:v.method,reference:v.reference??"",reason:v.reason});break;
   case "ACTIVATE":
    result=await activateAdmission({admissionId:id,requestId,reason:v.reason});break;
  }
  return privateJson(result,result.ok?200:409);
 }catch{return privateJson({error:"Workflow transaction could not be confirmed"},500);}
}
