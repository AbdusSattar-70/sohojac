import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {getStaffAccessForPage} from "@/lib/staff-access";
import {TeacherWorkspace} from "@/components/staff/teacher-workspace";
export const dynamic="force-dynamic";
export const metadata={title:"Teacher workspace · Sohoj Academy ERP",robots:{index:false,follow:false}};
export default async function TeacherPage(){
  const staff=await getStaffAccessForPage(await headers());
  if(!staff)redirect("/sign-in");
  if(staff.role!=="TEACHER")redirect("/dashboard");
  return <TeacherWorkspace/>;
}
