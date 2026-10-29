import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {getStaffAccessForPage} from "@/lib/staff-access";
import {ManagementReport} from "@/components/staff/management-report";
export const dynamic="force-dynamic";
export const metadata={title:"Management reports · Sohoj Academy ERP",robots:{index:false,follow:false}};
export default async function ReportsPage(){
  const staff=await getStaffAccessForPage(await headers());
  if(!staff)redirect("/sign-in");
  if(staff.role!=="OWNER"&&staff.role!=="ADMIN")redirect("/dashboard");
  return <ManagementReport/>;
}
