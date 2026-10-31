"use server";
import {env} from "cloudflare:workers";
import {headers} from "next/headers";
import {getErpContext} from "@/modules/platform/auth/erp-context";
import {manageMasterRecordSchema,type ManageMasterRecordInput,type MasterEntity} from "@/modules/crm/manage/schema";
export type ManageCrmMutationResult={ok:true;reference:string}|{ok:false;error:string;field?:string};
type Bind=string|number|null;
type Planned={table:string;sql:string;args:Bind[]};
const tables:Record<MasterEntity,string>={
 academic_year:"academic_years",class:"academy_classes",group:"academic_groups",
 subject:"academic_subjects",program:"academy_programmes",school:"academy_schools",
 lead_source:"academy_lead_sources",guardian_relationship:"academy_guardian_relationships",
};
function plan(v:ManageMasterRecordInput,id:string):Planned{
 const isEdit=Boolean(v.id),flag=v.isActive?1:0;
 const code=(v.code??"").trim().toUpperCase(),name=(v.name??"").trim();
 switch(v.entity){
  case "academic_year":
   // Existing D1 requires an internal code. The original ERP did not.
   return isEdit
    ? {table:tables[v.entity],sql:"UPDATE academic_years SET title=?,starts_on=?,ends_on=?,status=?,version=version+1 WHERE id=? AND version=?",
       args:[name,v.startsOn||null,v.endsOn||null,flag?"ACTIVE":"DRAFT",id,v.expectedVersion??-1]}
    : {table:tables[v.entity],sql:"INSERT INTO academic_years (id,code,title,starts_on,ends_on,status) VALUES (?,?,?,?,?,?)",
       args:[id,"YR-"+id.slice(0,8).toUpperCase(),name,v.startsOn||null,v.endsOn||null,flag?"ACTIVE":"DRAFT"]};
  case "class":
   return isEdit
    ? {table:tables[v.entity],sql:"UPDATE academy_classes SET code=?,name=?,sort_order=?,is_active=? WHERE id=?",
       args:[code,name,v.sortOrder??100,flag,id]}
    : {table:tables[v.entity],sql:"INSERT INTO academy_classes (id,code,name,sort_order,is_active) VALUES (?,?,?,?,?)",
       args:[id,code,name,v.sortOrder??100,flag]};
  case "group":
  case "lead_source":
  case "guardian_relationship": {
   const table=tables[v.entity];
   return isEdit
    ? {table,sql:"UPDATE "+table+" SET code=?,name=?,is_active=? WHERE id=?",args:[code,name,flag,id]}
    : {table,sql:"INSERT INTO "+table+" (id,code,name,is_active) VALUES (?,?,?,?)",args:[id,code,name,flag]};
  }
  case "subject":
   return isEdit
    ? {table:tables[v.entity],sql:"UPDATE academic_subjects SET code=?,title=?,active=? WHERE id=?",
       args:[code,name,flag,id]}
    : {table:tables[v.entity],sql:"INSERT INTO academic_subjects (id,code,title,active) VALUES (?,?,?,?)",
       args:[id,code,name,flag]};
  case "program":
   return isEdit
    ? {table:tables[v.entity],sql:"UPDATE academy_programmes SET code=?,name=?,description=?,active=? WHERE id=?",
       args:[code,name,v.description?.trim()||null,flag,id]}
    : {table:tables[v.entity],sql:"INSERT INTO academy_programmes (id,code,name,description,active) VALUES (?,?,?,?,?)",
       args:[id,code,name,v.description?.trim()||null,flag]};
  case "school":
   return isEdit
    ? {table:tables[v.entity],sql:"UPDATE academy_schools SET name=?,area_id=?,is_verified=?,is_active=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
       args:[name,v.areaId||null,v.isVerified?1:0,flag,id]}
    : {table:tables[v.entity],sql:"INSERT INTO academy_schools (id,name,area_id,is_verified,is_active) VALUES (?,?,?,?,?)",
       args:[id,name,v.areaId||null,v.isVerified?1:0,flag]};
 }
}
export async function manageCrmMasterRecord(input:ManageMasterRecordInput):Promise<ManageCrmMutationResult>{
 const parsed=manageMasterRecordSchema.safeParse(input);
 if(!parsed.success){
  const issue=parsed.error.issues[0];
  return {ok:false,error:issue?.message??"Check the academic master-data details.",field:issue?.path[0]?.toString()};
 }
 const context=await getErpContext();
 if(!context?.permissions.includes("system.master_data.manage"))
  return {ok:false,error:"You are not authorized to manage academic master data."};
 const h=await headers(),origin=h.get("origin"),host=h.get("host");
 if(!origin||!host)return {ok:false,error:"Invalid request origin."};
 try{
  if(new URL(origin).host.toLowerCase()!==host.toLowerCase())
   return {ok:false,error:"Invalid request origin."};
 }catch{return {ok:false,error:"Invalid request origin."};}
 const v=parsed.data;
 if(v.entity==="academic_year"&&(!/^\d{4}-\d{2}-\d{2}$/.test(v.startsOn??"")||
    !/^\d{4}-\d{2}-\d{2}$/.test(v.endsOn??"")))
  return {ok:false,error:"Use YYYY-MM-DD start/end dates.",field:"startsOn"};
 const id=v.id||crypto.randomUUID(),p=plan(v,id);
 try{
  const before=v.id?await env.DB.prepare("SELECT * FROM "+p.table+" WHERE id=?").bind(id).first():null;
  if(v.id&&!before)return {ok:false,error:"Record is unavailable. Refresh the register."};
  // A finalized CLOSED year is irreversible in the pre-existing D1 contract.
  // An ordinary inactive source record must remain DRAFT, never be closed.
  if(v.entity==="academic_year" && v.id && before &&
      (before as {status?:string}).status==="CLOSED")
    return {ok:false,error:"This academic year was permanently closed; the closure cannot be reversed."};
  if(v.entity==="academic_year" && v.id && before &&
      (before as {version?:number}).version!==v.expectedVersion)
    return {ok:false,error:"Another staff member changed this year. Refresh and reopen it before saving.",field:"expectedVersion"};
  const result=await env.DB.batch([
   env.DB.prepare(p.sql).bind(...p.args),
   env.DB.prepare("INSERT INTO erp_audit_events (id,entity_type,entity_id,action,actor_id,reason,before_json,after_json) "+
     "SELECT ?,?,?,?,?,?,?,? WHERE changes()=1")
    .bind(crypto.randomUUID(),"master_data_"+v.entity,id,v.id?"UPDATED":"CREATED",
     context.profileId,v.reason,JSON.stringify(before),JSON.stringify(v)),
  ]);
  if(result[0].meta.changes!==1||result[1].meta.changes!==1)
   return {ok:false,error:v.entity==="academic_year" && Boolean(v.id)
    ?"This academic year changed while you were saving. Refresh and reopen before retrying."
    :"Save not confirmed. Refresh before retrying."};
  const persisted=await env.DB.prepare("SELECT id FROM "+p.table+" WHERE id=?").bind(id).first<{id:string}>();
  if(!persisted)return {ok:false,error:"Save not confirmed. Refresh before retrying."};
  return {ok:true,reference:(v.id?"UPDATE:":"CREATE:")+id};
 }catch{return {ok:false,error:"Record not saved. Check duplicate codes and linked records; refresh before retrying."};}
}
