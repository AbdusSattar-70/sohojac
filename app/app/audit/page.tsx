import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {getStaffAccessForPage} from "@/lib/staff-access";
import {AuditViewer} from "@/components/staff/audit-viewer";
export const dynamic="force-dynamic";
export const metadata={title:"Audit log · Sohoj Academy ERP",robots:{index:false,follow:false}};
export default async function AuditPage(){
  const staff=await getStaffAccessForPage(await headers());
  if(!staff)redirect("/sign-in");
  if(!["OWNER","ADMIN"].includes(staff.role))redirect("/app");
  return <AuditViewer/>;
}
