"use server";
import {env} from "cloudflare:workers";
import {requireErpContext} from "@/modules/platform/auth/erp-context";
export type SearchRecord={id:string;title:string;detail:string;href:string};
export async function searchErpRecords(raw:string):Promise<{rows:SearchRecord[];failed:boolean}>{
 const context=await requireErpContext();
 const q=raw.trim().replace(/[^\p{L}\p{N}\s@+-]/gu," ").slice(0,80).trim();
 if(q.length<2||!context.permissions.includes("crm.prospects.view"))return {rows:[],failed:false};
 try{
  const found=await env.DB.prepare(
   "SELECT id,reference,student_name,class_name FROM public_enquiries "+
   "WHERE reference LIKE ? OR student_name LIKE ? ORDER BY submitted_at DESC LIMIT 12"
  ).bind("%"+q+"%","%"+q+"%").all<{id:string;reference:string;student_name:string;class_name:string}>();
  return {rows:(found.results??[]).map(row=>({id:row.id,title:row.student_name,
   detail:row.reference+" · "+row.class_name,href:"/app/prospects"})),failed:false};
 }catch{return {rows:[],failed:true};}
}
