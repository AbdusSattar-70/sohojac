import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {getStaffAccessForPage} from "@/lib/staff-access";
import {SubjectsRegister} from "@/components/staff/subjects-register";
export const dynamic="force-dynamic";
export const metadata={title:"Subjects · Sohoj Academy ERP",robots:{index:false,follow:false}};
export default async function SubjectsPage(){
  const staff=await getStaffAccessForPage(await headers());
  if(!staff)redirect("/sign-in");
  return <SubjectsRegister/>;
}
