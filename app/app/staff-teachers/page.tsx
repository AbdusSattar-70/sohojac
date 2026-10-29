import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {getStaffAccessForPage} from "@/lib/staff-access";
import {TeacherAssignments} from "@/components/staff/teacher-assignments";
export const dynamic="force-dynamic";
export const metadata={title:"Teacher assignments · Sohoj Academy ERP",robots:{index:false,follow:false}};
export default async function TeacherAssignmentsPage(){
  const staff=await getStaffAccessForPage(await headers());
  if(!staff)redirect("/sign-in");
  if(staff.role!=="OWNER"&&staff.role!=="ADMIN")redirect("/app");
  return <TeacherAssignments/>;
}
