import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {getStaffAccessForPage} from "@/lib/staff-access";
import {AccessReview} from "@/components/staff/access-review";
export const dynamic="force-dynamic";
export const metadata={title:"Staff access · Digital Campus",robots:{index:false,follow:false}};
export default async function StaffAccessPage(){
  const staff=await getStaffAccessForPage(await headers());
  if(!staff)redirect("/sign-in");
  if(staff.role!=="OWNER"&&staff.role!=="ADMIN"){
    return <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h1 className="text-xl font-extrabold">Access denied</h1>
      <p className="mt-2 text-sm text-slate-600">Only an authorized owner or administrator can review staff access requests.</p>
    </div>;
  }
  return <AccessReview isOwner={staff.role==="OWNER"}/>;
}
