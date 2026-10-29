import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {getStaffAccessForPage} from "@/lib/staff-access";
import {ExpensesRegister} from "@/components/staff/expenses-register";

export const dynamic="force-dynamic";
export const metadata={title:"Operating expenses · Sohoj Academy ERP",robots:{index:false,follow:false}};
export default async function ExpensesPage(){
  const staff=await getStaffAccessForPage(await headers());
  if(!staff)redirect("/sign-in");
  if(staff.role!=="OWNER"&&staff.role!=="ADMIN")redirect("/app");
  return <ExpensesRegister/>;
}
