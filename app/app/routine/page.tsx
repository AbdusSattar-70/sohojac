import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {getStaffAccessForPage} from "@/lib/staff-access";
import {RoutineRegister} from "@/components/staff/routine-register";
export const dynamic="force-dynamic";
export const metadata={title:"Class routine · Sohoj Academy ERP",robots:{index:false,follow:false}};
export default async function RoutinePage(){
  const staff=await getStaffAccessForPage(await headers());
  if(!staff)redirect("/sign-in");
  if(staff.role==="TEACHER")redirect("/app");
  return <RoutineRegister/>;
}
