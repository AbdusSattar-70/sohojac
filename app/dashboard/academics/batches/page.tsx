import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {getStaffAccessForPage} from "@/lib/staff-access";
import {BatchesRegister} from "@/components/staff/batches-register";
export const dynamic="force-dynamic";
export const metadata={title:"Batches · Sohoj Academy ERP",robots:{index:false,follow:false}};
export default async function BatchesPage(){
  const staff=await getStaffAccessForPage(await headers());
  if(!staff)redirect("/sign-in");
  return <BatchesRegister/>;
}
