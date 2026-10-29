import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {getStaffAccessForPage} from "@/lib/staff-access";
import {OfferingsRegister} from "@/components/staff/offerings-register";
export const dynamic="force-dynamic";
export const metadata={title:"Programme offerings · Sohoj Academy ERP",robots:{index:false,follow:false}};
export default async function OfferingManagement(){
  const staff=await getStaffAccessForPage(await headers());
  if(!staff)redirect("/sign-in");
  return <OfferingsRegister/>;
}
