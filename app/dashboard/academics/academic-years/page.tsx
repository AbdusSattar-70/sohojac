import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {getStaffAccessForPage} from "@/lib/staff-access";
import {AcademicYearsRegister} from "@/components/staff/academic-years-register";
export const dynamic="force-dynamic";
export const metadata={title:"Academic years · Sohoj Academy ERP",robots:{index:false,follow:false}};
export default async function AcademicYearsPage(){
  const staff=await getStaffAccessForPage(await headers());
  if(!staff)redirect("/sign-in");
  return <AcademicYearsRegister/>;
}
