"use server";
import {headers} from "next/headers";
import {env} from "cloudflare:workers";
import {revalidatePath} from "next/cache";
import {getErpContext} from "@/modules/platform/auth/erp-context";
import {updateOfferingPublicControlsSchema,type UpdateOfferingPublicControlsInput} from "@/modules/offerings/schema";

export type OfferingMutationResult=
 | {ok:true;reference:string}
 | {ok:false;error:string;field?:string};
const empty=(x:string)=>x.trim()||null;

export async function updateProgrammeOfferingPublicControls(
 input:UpdateOfferingPublicControlsInput
):Promise<OfferingMutationResult>{
 const parsed=updateOfferingPublicControlsSchema.safeParse(input);
 if(!parsed.success){
  const issue=parsed.error.issues[0];
  return {ok:false,error:issue?.message??"Check public controls.",field:issue?.path[0]?.toString()};
 }
 const context=await getErpContext();
 if(!context?.permissions.includes("academics.manage"))
  return {ok:false,error:"You are not authorized to update offering public controls."};
 const h=await headers(),origin=h.get("origin"),host=h.get("host");
 if(!origin||!host)return {ok:false,error:"Invalid request origin."};
 try{if(new URL(origin).host.toLowerCase()!==host.toLowerCase())
  return {ok:false,error:"Invalid request origin."};}
 catch{return {ok:false,error:"Invalid request origin."};}
 const v=parsed.data;
 if(v.subjectIds.length)
  return {ok:false,error:"Edit subjects in the Academic Programme Offering workspace.",field:"subjectIds"};
 try{
  const prior=await env.DB.prepare(
   "SELECT id,code,name,is_active,show_on_website,is_accepting_applications,"+
   "application_state,applications_open_on,applications_close_on,version "+
   "FROM public_programme_offerings WHERE id=?"
  ).bind(v.offeringId).first<{
   id:string;code:string;name:string;is_active:number;show_on_website:number;
   is_accepting_applications:number;application_state:string;
   applications_open_on:string|null;applications_close_on:string|null;version:number;
  }>();
  if(!prior)return {ok:false,error:"Programme offering is unavailable. Refresh before saving."};
  if(v.isWebsiteVisible&&!prior.is_active)
   return {ok:false,error:"Activate the programme operationally before publishing it.",field:"isWebsiteVisible"};
  const today=new Date().toISOString().slice(0,10);
  const open=v.applicationsOpenOn?.trim()||null,close=v.applicationsCloseOn?.trim()||null;
  const state=!v.isAcceptingApplications?"CLOSED":
   open&&open.slice(0,10)>today?"UPCOMING":
   close&&close.slice(0,10)<today?"CLOSED":"OPEN";
  const data=[
   empty(v.showcaseTitle),empty(v.showcaseTitleBn),
   empty(v.showcaseDescription),empty(v.showcaseDescriptionBn),
   empty(v.showcaseEyebrow),empty(v.showcaseEyebrowBn),
   empty(v.publicSchedule),empty(v.publicScheduleBn),
   empty(v.publicRequirements),empty(v.publicRequirementsBn),
   empty(v.admissionPolicy),empty(v.admissionPolicyBn),
   empty(v.showcaseIcon),v.showcaseSortOrder,
   v.isWebsiteVisible?1:0,v.isAcceptingApplications?1:0,state,open,close
  ];
  const event=crypto.randomUUID();
  const result=await env.DB.batch([
   env.DB.prepare(
    "UPDATE public_programme_offerings SET showcase_title=?,showcase_title_bn=?,"+
    "showcase_description=?,showcase_description_bn=?,showcase_eyebrow=?,showcase_eyebrow_bn=?,"+
    "public_schedule=?,public_schedule_bn=?,public_requirements=?,public_requirements_bn=?,"+
    "admission_policy=?,admission_policy_bn=?,showcase_icon=?,showcase_sort_order=?,"+
    "show_on_website=?,is_accepting_applications=?,application_state=?,"+
    "applications_open_on=?,applications_close_on=?,version=version+1 "+
    "WHERE id=? AND version=?"
   ).bind(...data,v.offeringId,prior.version),
   env.DB.prepare(
    "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,before_json,after_json) "+
    "SELECT ?,'programme_offering',?,'PUBLIC_CONTROLS_UPDATED',?,?,?,? WHERE changes()=1"
   ).bind(event,v.offeringId,context.profileId,v.reason,
    JSON.stringify(prior),JSON.stringify({data,applicationState:state}))
  ]);
  if(result.length!==2||result.some(x=>x.meta?.changes!==1))
   return {ok:false,error:"Offering changed. Refresh before retrying."};
  revalidatePath("/dashboard/academics/offerings");
  revalidatePath("/dashboard/crm/manage");
  revalidatePath("/");
  revalidatePath("/interest");
  return {ok:true,reference:prior.id};
 }catch{return {ok:false,error:"Could not save programme public controls. Refresh and retry."};}
}
