import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {getStaffAccessForPage} from "@/lib/staff-access";
import {AdmissionsRegister} from "@/components/staff/admissions-register";
export const dynamic="force-dynamic";
export const metadata={title:"Admissions · Sohoj Academy ERP",robots:{index:false,follow:false}};
export default async function AdmissionsPage(){
  const staff=await getStaffAccessForPage(await headers());
  if(!staff)redirect("/sign-in");
  if(staff.role==="TEACHER")redirect("/app");
  return <AdmissionsRegister/>;
}
