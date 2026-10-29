import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {getStaffAccessForPage} from "@/lib/staff-access";
import {StudentsRegister} from "@/components/staff/students-register";
export const dynamic="force-dynamic";
export const metadata={title:"Students · Sohoj Academy ERP",robots:{index:false,follow:false}};
export default async function StudentsPage(){
  const staff=await getStaffAccessForPage(await headers());
  if(!staff)redirect("/sign-in");
  if(staff.role==="TEACHER")redirect("/app");
  return <StudentsRegister/>;
}
