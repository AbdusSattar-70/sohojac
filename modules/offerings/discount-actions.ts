"use server";
import {z} from "zod";
import {env} from "cloudflare:workers";
import {headers} from "next/headers";
import {revalidatePath} from "next/cache";
import {getErpContext} from "@/modules/platform/auth/erp-context";
const schema=z.object({offeringId:z.string().trim().min(2).max(100).regex(/^[A-Za-z0-9-]+$/),percentages:z.array(z.number().int().refine(v=>[5,10,15,20,25,30].includes(v))).max(6)});
export async function saveOfferingDiscountPolicy(input:unknown){
 const p=schema.safeParse(input);if(!p.success)return {ok:false,message:"Choose valid discount percentages."};
 const context=await getErpContext();if(!context?.permissions.includes("finance.billing.manage"))return {ok:false,message:"Billing management permission required."};
 const h=await headers();try{if(!h.get("origin")||!h.get("host")||new URL(h.get("origin")!).host.toLowerCase()!==h.get("host")!.toLowerCase())return {ok:false,message:"Invalid request origin."};}catch{return {ok:false,message:"Invalid request origin."};}
 const old=await env.DB.prepare("SELECT id,version,allowed_discount_percentages_json FROM public_programme_offerings WHERE id=?").bind(p.data.offeringId).first<{id:string;version:number;allowed_discount_percentages_json:string}>();
 if(!old)return {ok:false,message:"Offering not found."};
 const percentages=[...new Set(p.data.percentages)].sort((a,b)=>a-b);
 try{
  const tx=await env.DB.batch([
   env.DB.prepare("UPDATE public_programme_offerings SET allowed_discount_percentages_json=?,version=version+1,source_updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND version=? RETURNING id").bind(JSON.stringify(percentages),old.id,old.version),
   env.DB.prepare("INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,before_json,after_json) SELECT ?,'programme_offering',?,'SAVE_DISCOUNT_POLICY',?,'Updated permitted admission discounts',?,? WHERE changes()=1 RETURNING id").bind(crypto.randomUUID(),old.id,context.profileId,JSON.stringify(old),JSON.stringify({allowed_discount_percentages:percentages}))
  ]);
  if(tx.some(r=>r.results?.length!==1))return {ok:false,message:"Offering changed. Refresh before saving."};
  for(const path of ["/dashboard/finance/fee-plans","/dashboard/academics/offerings","/dashboard/admissions","/dashboard/governance/audit"])revalidatePath(path);
  return {ok:true,message:"Discount policy saved."};
 }catch{return {ok:false,message:"Discount policy was not saved. Refresh and retry."};}
}
