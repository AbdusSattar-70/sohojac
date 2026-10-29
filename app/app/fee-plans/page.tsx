import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {getStaffAccessForPage} from "@/lib/staff-access";
import {FeePlansRegister} from "@/components/staff/fee-plans-register";
export const dynamic="force-dynamic";
export const metadata={title:"Fee plans · Sohoj Academy ERP",robots:{index:false,follow:false}};
export default async function FeePlansPage(){
  const staff=await getStaffAccessForPage(await headers());
  if(!staff)redirect("/sign-in");
  return <FeePlansRegister/>;
}
