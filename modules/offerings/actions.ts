"use server";
import {headers} from "next/headers";
import {env} from "cloudflare:workers";
import {revalidatePath} from "next/cache";
import {getErpContext} from "@/modules/platform/auth/erp-context";
import {createOfferingSchema,updateOfferingSchema,publishFeePlanSchema,updateOfferingPublicControlsSchema,type CreateOfferingInput,type UpdateOfferingInput,type PublishFeePlanInput,type UpdateOfferingPublicControlsInput} from "./schema";

export type OfferingMutationResult={ok:true;reference:string}|{ok:false;error:string;field?:string};
type Context={profileId:string;permissions:string[]};
type Existing={id:string;version:number;name:string;code:string;offering_status:string|null;is_active:number;branch_id:string|null;academic_year_id:string|null;class_id:string|null;program_id:string|null;group_id:string|null;operation_kind:string|null;teaching_starts_on:string|null;teaching_ends_on:string|null};
const empty=(s:string)=>s.trim()||null;
async function authorized(permission:string):Promise<Context|null>{
 const context=await getErpContext();
 if(!context?.permissions.includes(permission))return null;
 const h=await headers(),origin=h.get("origin"),host=h.get("host");
 try{if(!origin||!host||new URL(origin).host.toLowerCase()!==host.toLowerCase())return null;}catch{return null;}
 return context;
}
function refresh(){
 for(const path of ["/dashboard/academics/offerings","/dashboard/academics/batches","/dashboard/admissions","/dashboard/finance/fee-plans","/dashboard/crm/manage","/dashboard/governance/audit","/","/interest"])revalidatePath(path);
}
function invalid(parsed:{error:{issues:Array<{message:string;path:PropertyKey[]}>}}):OfferingMutationResult{
 const issue=parsed.error.issues[0];return {ok:false,error:issue?.message??"Check the input.",field:issue?.path[0]?.toString()};
}
async function replay(requestId:string,actor:string,command:string,payload:string):Promise<OfferingMutationResult|null>{
 const found=await env.DB.prepare("SELECT actor_id,command,payload_json,entity_id FROM academy_offering_command_keys WHERE request_id=?")
  .bind(requestId).first<{actor_id:string;command:string;payload_json:string;entity_id:string}>();
 if(!found)return null;
 return found.actor_id===actor&&found.command===command&&found.payload_json===payload
  ?{ok:true,reference:found.entity_id}:{ok:false,error:"This request identity was already used for different input."};
}
function key(requestId:string,user:string,command:string,payload:string,entityId:string){
 return env.DB.prepare("INSERT INTO academy_offering_command_keys(request_id,actor_id,command,payload_json,entity_id) SELECT ?,?,?,?,? WHERE changes()=1 RETURNING request_id")
  .bind(requestId,user,command,payload,entityId);
}
function audit(requestId:string,user:string,command:string,payload:string,entityId:string,reason:string,before:unknown=null){
 return env.DB.prepare([
  "INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,before_json,after_json)",
  "SELECT ?,?,?,?,?,?,?,? FROM academy_offering_command_keys",
  "WHERE request_id=? AND actor_id=? AND command=? AND payload_json=? AND entity_id=? RETURNING id"
 ].join(" ")).bind(requestId,command==="PUBLISH_FEES"?"fee_plan":"programme_offering",entityId,command,user,reason,before===null?null:JSON.stringify(before),payload,requestId,user,command,payload,entityId);
}
async function existing(id:string){return env.DB.prepare("SELECT id,version,name,code,offering_status,is_active,branch_id,academic_year_id,class_id,program_id,group_id,operation_kind,teaching_starts_on,teaching_ends_on FROM public_programme_offerings WHERE id=?").bind(id).first<Existing>();}
type LearningContext={branchId:string;operationKind:string;academicYearId:string;classId:string;programId:string;groupId:string;teachingStartsOn:string;teachingEndsOn:string};
const contextSql=[
 "SELECT 1 FROM academy_branches b JOIN academy_programmes p ON p.id=?",
 "LEFT JOIN academic_years y ON y.id=NULLIF(?,'')",
 "LEFT JOIN academy_classes c ON c.id=NULLIF(?,'') LEFT JOIN academic_groups g ON g.id=NULLIF(?,'')",
 "WHERE b.id=? AND b.is_active=1 AND p.active=1",
 "AND (?='' OR y.id IS NOT NULL) AND (?='' OR (c.id IS NOT NULL AND c.is_active=1))",
 "AND (?='' OR (g.id IS NOT NULL AND g.is_active=1))",
 "AND (?='TRAINING' OR (y.id IS NOT NULL AND c.id IS NOT NULL))",
 "AND (?<>'TRAINING' OR (?<>'' AND ?<>'' AND ?<=?))"
].join(" ");
function contextBindings(v:LearningContext){return [v.programId,v.academicYearId,v.classId,v.groupId,v.branchId,v.academicYearId,v.classId,v.groupId,v.operationKind,v.operationKind,v.teachingStartsOn,v.teachingEndsOn,v.teachingStartsOn,v.teachingEndsOn];}
function contextChanged(v:LearningContext,old:Existing){
 return v.branchId!==old.branch_id||(v.academicYearId||null)!==old.academic_year_id||(v.classId||null)!==old.class_id||v.programId!==old.program_id||(v.groupId||null)!==old.group_id||v.operationKind!==old.operation_kind;
}
export async function createProgrammeOffering(input:CreateOfferingInput):Promise<OfferingMutationResult>{
 const parsed=createOfferingSchema.safeParse(input);if(!parsed.success)return invalid(parsed);
 const context=await authorized("academics.manage");if(!context)return {ok:false,error:"Offering management permission and a same-origin request are required."};
 const v=parsed.data,payload=JSON.stringify(v),prior=await replay(v.requestId,context.profileId,"CREATE",payload);if(prior)return prior;
 const id=crypto.randomUUID();
 try{
  const tx=await env.DB.batch([
   env.DB.prepare([
    "INSERT INTO public_programme_offerings(id,code,name,branch_id,academic_year_id,class_id,program_id,group_id,operation_kind,teaching_starts_on,teaching_ends_on,offering_status,is_active,class_name,academic_year_name,branch_name,group_name,source_updated_at)",
    "SELECT ?,upper(?),COALESCE(NULLIF(?,''),(SELECT name FROM academy_programmes WHERE id=?)),?,NULLIF(?,''),NULLIF(?,''),?,NULLIF(?,''),?,NULLIF(?,''),NULLIF(?,''),'DRAFT',0,",
    "COALESCE((SELECT name FROM academy_classes WHERE id=?),''),COALESCE((SELECT title FROM academic_years WHERE id=?),''),",
    "(SELECT name FROM academy_branches WHERE id=?),(SELECT name FROM academic_groups WHERE id=?),strftime('%Y-%m-%dT%H:%M:%fZ','now')",
    "WHERE EXISTS("+contextSql+") RETURNING id"
   ].join(" ")).bind(id,v.code,v.name,v.programId,v.branchId,v.academicYearId,v.classId,v.programId,v.groupId,v.operationKind,v.teachingStartsOn,v.teachingEndsOn,v.classId,v.academicYearId,v.branchId,v.groupId,...contextBindings(v)),
   key(v.requestId,context.profileId,"CREATE",payload,id),
   audit(v.requestId,context.profileId,"CREATE",payload,id,v.reason)
  ]);
  if(tx.some(r=>(r.results?.length??0)!==1))return {ok:false,error:"Choose verified active branch, programme, class and year context."};
  refresh();return {ok:true,reference:id};
 }catch{const done=await replay(v.requestId,context.profileId,"CREATE",payload);return done??{ok:false,error:"Offering was not created. Check its unique code and master data."};}
}
export async function updateProgrammeOffering(input:UpdateOfferingInput):Promise<OfferingMutationResult>{
 const parsed=updateOfferingSchema.safeParse(input);if(!parsed.success)return invalid(parsed);
 const context=await authorized("academics.manage");if(!context)return {ok:false,error:"Offering management permission and a same-origin request are required."};
 const v=parsed.data,payload=JSON.stringify(v),prior=await replay(v.requestId,context.profileId,"UPDATE",payload);if(prior)return prior;
 const old=await existing(v.offeringId);if(!old)return {ok:false,error:"Offering not found."};
 if(old.version!==v.expectedVersion)return {ok:false,error:"Offering changed. Refresh before saving."};
 const linked=Boolean(old.branch_id&&old.program_id&&old.operation_kind);
 if(linked&&(old.offering_status!=="DRAFT"||old.is_active===1)&&contextChanged(v,old))
  return {ok:false,error:"Academic context is locked after activation. Create a separate offering for new context."};
 // Draft placements also make their academic context permanent.
 const used=await env.DB.prepare("SELECT id FROM academy_batches WHERE offering_id=? LIMIT 1").bind(v.offeringId).first<{id:string}>();
 if(linked&&used&&contextChanged(v,old))return {ok:false,error:"Existing batches retain their offering context. Create a separate offering."};
 try{
  const tx=await env.DB.batch([
   env.DB.prepare([
    "UPDATE public_programme_offerings SET code=upper(?),name=COALESCE(NULLIF(?,''),(SELECT name FROM academy_programmes WHERE id=?)),",
    "branch_id=?,academic_year_id=NULLIF(?,''),class_id=NULLIF(?,''),program_id=?,group_id=NULLIF(?,''),operation_kind=?,teaching_starts_on=NULLIF(?,''),teaching_ends_on=NULLIF(?,''),",
    "class_name=COALESCE((SELECT name FROM academy_classes WHERE id=?),''),academic_year_name=COALESCE((SELECT title FROM academic_years WHERE id=?),''),",
    "branch_name=(SELECT name FROM academy_branches WHERE id=?),group_name=(SELECT name FROM academic_groups WHERE id=?),version=version+1,source_updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",
    "WHERE id=? AND version=? AND EXISTS("+contextSql+")",
    "AND (?=0 OR NOT EXISTS(SELECT 1 FROM academy_batches b WHERE b.offering_id=public_programme_offerings.id)",
    "OR (branch_id IS ? AND academic_year_id IS NULLIF(?,'') AND class_id IS NULLIF(?,'') AND program_id IS ? AND group_id IS NULLIF(?,'') AND operation_kind IS ?))",
    "AND (NOT EXISTS(SELECT 1 FROM academy_class_sessions s JOIN academy_batches b ON b.id=s.batch_id WHERE b.offering_id=public_programme_offerings.id)",
    "OR (operation_kind IS ? AND teaching_starts_on IS NULLIF(?,'') AND teaching_ends_on IS NULLIF(?,''))) RETURNING id"
   ].join(" ")).bind(v.code,v.name,v.programId,v.branchId,v.academicYearId,v.classId,v.programId,v.groupId,v.operationKind,v.teachingStartsOn,v.teachingEndsOn,v.classId,v.academicYearId,v.branchId,v.groupId,v.offeringId,v.expectedVersion,...contextBindings(v),linked?1:0,v.branchId,v.academicYearId,v.classId,v.programId,v.groupId,v.operationKind,v.operationKind,v.teachingStartsOn,v.teachingEndsOn),
   key(v.requestId,context.profileId,"UPDATE",payload,v.offeringId),
   audit(v.requestId,context.profileId,"UPDATE",payload,v.offeringId,v.reason,old)
  ]);
  if(tx.some(r=>(r.results?.length??0)!==1))return {ok:false,error:"Offering or master data changed. Refresh before retrying."};
  refresh();return {ok:true,reference:v.offeringId};
 }catch{const done=await replay(v.requestId,context.profileId,"UPDATE",payload);return done??{ok:false,error:"Offering update failed. Its stable ID and history were retained."};}
}
function todayInDhaka(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Dhaka",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
export async function publishFeePlan(input:PublishFeePlanInput):Promise<OfferingMutationResult>{
 const parsed=publishFeePlanSchema.safeParse(input);if(!parsed.success)return invalid(parsed);
 const context=await authorized("finance.billing.manage");if(!context)return {ok:false,error:"Billing management permission and a same-origin request are required."};
 const v=parsed.data,payload=JSON.stringify(v),prior=await replay(v.requestId,context.profileId,"PUBLISH_FEES",payload);if(prior)return prior;
 const today=todayInDhaka();
 if(v.effectiveFrom!==today)return {ok:false,error:"Current fee changes take effect today in Asia/Dhaka.",field:"effectiveFrom"};
 const amounts=v.components.map(c=>Math.round(c.amount*100));
 if(amounts.some((n,i)=>!Number.isSafeInteger(n)||n<0||Math.abs(v.components[i].amount*100-n)>0.0001))
  return {ok:false,error:"Use valid amounts with at most two decimal places.",field:"components"};
 if(!v.components.some((c,i)=>c.chargeType==="TUITION"&&c.recurrence==="PER_CYCLE"&&amounts[i]>0))
  return {ok:false,error:"A positive per-cycle Tuition component is required.",field:"components"};
 const recurring=amounts.reduce((n,x,i)=>n+(v.components[i].recurrence==="PER_CYCLE"?x:0),0);
 const oneTime=amounts.reduce((n,x,i)=>n+(v.components[i].recurrence==="ONE_TIME"?x:0),0);
 if(!Number.isSafeInteger(recurring+oneTime))return {ok:false,error:"Fee total is outside the supported range."};
 const id=crypto.randomUUID();
 const components=JSON.stringify(v.components.map((c,i)=>({id:crypto.randomUUID(),code:c.code.toUpperCase(),name:c.name,amount:amounts[i],type:c.chargeType,recurrence:c.recurrence,sort:i})));
 try{
  const tx=await env.DB.batch([
   env.DB.prepare([
    "UPDATE public_programme_offerings SET version=version+1,is_active=1,offering_status='ACTIVE',source_updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",
    "WHERE id=? AND version=? AND COALESCE(offering_status,CASE WHEN is_active=1 THEN 'ACTIVE' ELSE 'DRAFT' END)<>'RETIRED' RETURNING id"
   ].join(" ")).bind(v.offeringId,v.expectedVersion),
   key(v.requestId,context.profileId,"PUBLISH_FEES",payload,id),
   env.DB.prepare([
    "INSERT INTO academy_fee_plans(id,offering_id,title,monthly_amount_paisa,admission_amount_paisa,active,source_version,source_status,billing_cycle,due_day,currency_code,effective_from,change_reason,created_by,created_at)",
    "SELECT ?,?,'Standard fees',?,?,0,COALESCE((SELECT MAX(source_version) FROM academy_fee_plans WHERE offering_id=?),0)+1,'DRAFT',?,?,'BDT',?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now')",
    "FROM academy_offering_command_keys WHERE request_id=? AND actor_id=? AND entity_id=? RETURNING id"
   ].join(" ")).bind(id,v.offeringId,recurring,oneTime,v.offeringId,v.billingCycle,v.dueDay,today,v.reason,context.profileId,v.requestId,context.profileId,id),
   env.DB.prepare([
    "INSERT INTO academy_fee_plan_components(id,plan_id,code,name,amount_paisa,charge_type,recurrence,sort_order)",
    "SELECT json_extract(j.value,'$.id'),?,json_extract(j.value,'$.code'),json_extract(j.value,'$.name'),json_extract(j.value,'$.amount'),",
    "json_extract(j.value,'$.type'),json_extract(j.value,'$.recurrence'),json_extract(j.value,'$.sort')",
    "FROM json_each(?) j WHERE EXISTS(SELECT 1 FROM academy_fee_plans p WHERE p.id=? AND p.source_status='DRAFT') RETURNING id"
   ].join(" ")).bind(id,components,id),
   env.DB.prepare([
    "UPDATE academy_fee_plans SET active=0,source_status=CASE WHEN source_version IS NULL THEN NULL ELSE 'RETIRED' END,effective_to=CASE WHEN effective_from>? THEN effective_from ELSE ? END",
    "WHERE offering_id=? AND id<>? AND active=1 AND EXISTS(SELECT 1 FROM academy_fee_plans p WHERE p.id=? AND p.source_status='DRAFT') RETURNING id"
   ].join(" ")).bind(today,today,v.offeringId,id,id),
   env.DB.prepare("UPDATE academy_fee_plans SET active=1,source_status='ACTIVE' WHERE id=? AND source_status='DRAFT' AND (SELECT COUNT(*) FROM academy_fee_plan_components WHERE plan_id=?)=? RETURNING id").bind(id,id,v.components.length),
   env.DB.prepare([
    "UPDATE public_programme_offerings SET fee_plan_json=json_object('billing_cycle',?,'currency_code','BDT','components',json(?))",
    "WHERE id=? AND EXISTS(SELECT 1 FROM academy_fee_plans p WHERE p.id=? AND p.source_status='ACTIVE') RETURNING id"
   ].join(" ")).bind(v.billingCycle,JSON.stringify(v.components.map(c=>({code:c.code.toUpperCase(),name:c.name,amount:c.amount,charge_type:c.chargeType,recurrence:c.recurrence}))),v.offeringId,id),
   audit(v.requestId,context.profileId,"PUBLISH_FEES",payload,id,v.reason)
  ]);
  if(tx[0].results?.length!==1||tx[1].results?.length!==1||tx[2].results?.length!==1||tx[3].results?.length!==v.components.length||tx[5].results?.length!==1||tx[6].results?.length!==1||tx[7].results?.length!==1)
   return {ok:false,error:"Offering changed or fee publication was not confirmed. Refresh before retrying."};
  refresh();return {ok:true,reference:id};
 }catch{const done=await replay(v.requestId,context.profileId,"PUBLISH_FEES",payload);return done??{ok:false,error:"Fee publication failed; previous charges and admission history were retained."};}
}

export async function updateProgrammeOfferingPublicControls(input:UpdateOfferingPublicControlsInput):Promise<OfferingMutationResult>{
 const parsed=updateOfferingPublicControlsSchema.safeParse(input);if(!parsed.success)return invalid(parsed);
 const context=await authorized("academics.manage");if(!context)return {ok:false,error:"You are not authorized to update public controls."};
 const v=parsed.data,requestId=v.requestId??crypto.randomUUID(),payload=JSON.stringify(v);
 const prior=await replay(requestId,context.profileId,"PUBLIC_CONTROLS_UPDATED",payload);if(prior)return prior;
 const old=await existing(v.offeringId);if(!old)return {ok:false,error:"Offering not found."};
 if(v.expectedVersion!==undefined&&v.expectedVersion!==old.version)return {ok:false,error:"Offering changed. Refresh before saving."};
 if(v.isWebsiteVisible&&!old.is_active)return {ok:false,error:"Activate the offering before publishing it.",field:"isWebsiteVisible"};
 if(new Set(v.subjectIds).size!==v.subjectIds.length)return {ok:false,error:"Choose each subject once.",field:"subjectIds"};
 const selected=JSON.stringify(v.subjectIds),today=todayInDhaka();
 const open=v.applicationsOpenOn?.trim()||null,close=v.applicationsCloseOn?.trim()||null;
 const applicationState=!v.isAcceptingApplications?"CLOSED":open&&open.slice(0,10)>today?"UPCOMING":close&&close.slice(0,10)<today?"CLOSED":"OPEN";
 const columns=["showcase_title","showcase_title_bn","showcase_description","showcase_description_bn","showcase_eyebrow","showcase_eyebrow_bn","public_schedule","public_schedule_bn","public_requirements","public_requirements_bn","admission_policy","admission_policy_bn","showcase_icon","showcase_sort_order","show_on_website","is_accepting_applications","application_state","applications_open_on","applications_close_on"];
 const values=[empty(v.showcaseTitle),empty(v.showcaseTitleBn),empty(v.showcaseDescription),empty(v.showcaseDescriptionBn),empty(v.showcaseEyebrow),empty(v.showcaseEyebrowBn),empty(v.publicSchedule),empty(v.publicScheduleBn),empty(v.publicRequirements),empty(v.publicRequirementsBn),empty(v.admissionPolicy),empty(v.admissionPolicyBn),empty(v.showcaseIcon),v.showcaseSortOrder,v.isWebsiteVisible?1:0,v.isAcceptingApplications?1:0,applicationState,open,close];
 try{
  const tx=await env.DB.batch([
   env.DB.prepare("UPDATE public_programme_offerings SET "+columns.map(c=>c+"=?").join(",")+",version=version+1,source_updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND version=? AND NOT EXISTS(SELECT 1 FROM json_each(?) j LEFT JOIN academy_subjects s ON s.id=j.value WHERE s.id IS NULL OR (s.active<>1 AND NOT EXISTS(SELECT 1 FROM academy_offering_subjects linked WHERE linked.offering_id=? AND linked.subject_id=s.id))) RETURNING id").bind(...values,v.offeringId,old.version,selected,v.offeringId),
   key(requestId,context.profileId,"PUBLIC_CONTROLS_UPDATED",payload,v.offeringId),
   env.DB.prepare("DELETE FROM academy_offering_subjects WHERE offering_id=? AND EXISTS(SELECT 1 FROM academy_offering_command_keys WHERE request_id=? AND actor_id=? AND entity_id=?)").bind(v.offeringId,requestId,context.profileId,v.offeringId),
   env.DB.prepare("INSERT INTO academy_offering_subjects(offering_id,subject_id,sort_order) SELECT ?,j.value,CAST(j.key AS INTEGER) FROM json_each(?) j WHERE EXISTS(SELECT 1 FROM academy_offering_command_keys WHERE request_id=? AND actor_id=? AND entity_id=?) RETURNING subject_id").bind(v.offeringId,selected,requestId,context.profileId,v.offeringId),
   audit(requestId,context.profileId,"PUBLIC_CONTROLS_UPDATED",payload,v.offeringId,v.reason,old)
  ]);
  if(tx[0].results?.length!==1||tx[1].results?.length!==1||tx[3].results?.length!==v.subjectIds.length||tx[4].results?.length!==1)return {ok:false,error:"Offering or subjects changed. Refresh before retrying."};
  refresh();return {ok:true,reference:v.offeringId};
 }catch{const done=await replay(requestId,context.profileId,"PUBLIC_CONTROLS_UPDATED",payload);return done??{ok:false,error:"Public controls were not saved. Existing settings remain available."};}
}
