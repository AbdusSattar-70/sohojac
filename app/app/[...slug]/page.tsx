import {notFound,redirect} from "next/navigation";
export const dynamic="force-dynamic";
/** One-way compatibility for old external bookmarks; no parallel ERP renders on /app. */
const routes:Record<string,string>={
 "academic-years":"/dashboard/academics/academic-years",
 "admissions":"/dashboard/admissions",
 "assessments":"/dashboard/academics/assessments",
 "attendance":"/dashboard/attendance",
 "audit":"/dashboard/governance/audit",
 "batches":"/dashboard/academics/batches",
 "collections":"/dashboard/finance/collections",
 "expenses":"/dashboard/finance/expenses",
 "fee-plans":"/dashboard/finance/fee-plans",
 "offerings":"/dashboard/academics/offerings",
 "prospects":"/dashboard/crm/prospects",
 "reports":"/dashboard/finance/reports",
 "routine":"/dashboard/academics/routine",
 "staff-access":"/dashboard/staff/access",
 "staff-directory":"/dashboard/staff/directory",
 "staff-teachers":"/dashboard/staff/teachers",
 "students":"/dashboard/students",
 "subjects":"/dashboard/academics/subjects",
 "teacher":"/dashboard/teacher"
};
export default async function LegacyRedirect({params,searchParams}:{
 params:Promise<{slug:string[]}>;
 searchParams:Promise<Record<string,string|string[]|undefined>>;
}){
 const path=(await params).slug??[],root=routes[path[0]];
 if(!root)notFound();
 let dest=root;
 if(path[0]==="admissions"&&path.length>1){
  const id=path[1];
  if(!/^[0-9a-f-]{36}$/i.test(id))notFound();
  if(path.length===2)dest+="/"+id;
  else if(path.length===3&&["bill","print"].includes(path[2]))dest+="/"+id+"/"+path[2];
  else notFound();
 }else if(path.length!==1)notFound();
 const query=await searchParams,paramsOut=new URLSearchParams();
 for(const [key,val] of Object.entries(query)){
  if(["start","view","prospect","receipt","status"].includes(key)&&typeof val==="string"&&val.length<100)paramsOut.set(key,val);
 }
 redirect(dest+(paramsOut.size?"?"+paramsOut:""));
}
