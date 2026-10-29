import {requirePermission} from "@/modules/platform/auth/erp-context";
import {BillingOverview} from "@/components/erp/billing-overview";
export const dynamic="force-dynamic";
export const metadata={title:"Student billing & receivables · Sohoj Academy",robots:{index:false,follow:false}};
export default async function BillingPage(){
 await requirePermission("finance.view");
 return <BillingOverview/>;
}
