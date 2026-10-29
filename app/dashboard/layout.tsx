import {ErpShell} from "@/components/erp/erp-shell";
import {getErpContext} from "@/modules/platform/auth/erp-context";
import {redirect} from "next/navigation";
import type {ReactNode} from "react";

export const dynamic="force-dynamic";
export const metadata={robots:{index:false,follow:false}};
export default async function DashboardLayout({children}:{children:ReactNode}){
 const context=await getErpContext();
 if(!context)redirect("/sign-in");
 return <div lang="en" data-locale="en" className="erp-dark min-h-screen bg-background text-foreground">
  <ErpShell context={context}>{children}</ErpShell>
 </div>;
}
