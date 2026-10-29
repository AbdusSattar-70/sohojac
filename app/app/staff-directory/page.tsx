import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {getStaffAccessForPage} from "@/lib/staff-access";
import {StaffDirectory} from "@/components/staff/staff-directory";

export const dynamic="force-dynamic";
export const metadata={title:"Staff register · Sohoj Academy",robots:{index:false,follow:false}};
export default async function StaffDirectoryPage(){
 const staff=await getStaffAccessForPage(await headers());
 if(!staff)redirect("/sign-in");
 if(staff.role!=="OWNER"&&staff.role!=="ADMIN")redirect("/app");
 return <StaffDirectory/>;
}
