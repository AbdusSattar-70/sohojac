import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {getStaffAccessForPage} from "@/lib/staff-access";
import {CollectionsRegister} from "@/components/staff/collections-register";
export const dynamic="force-dynamic";
export const metadata={title:"Tuition collections · Sohoj Academy ERP",robots:{index:false,follow:false}};
export default async function CollectionsPage(){
  const staff=await getStaffAccessForPage(await headers());
  if(!staff)redirect("/sign-in");
  if(staff.role==="TEACHER")redirect("/dashboard");
  return <CollectionsRegister/>;
}
