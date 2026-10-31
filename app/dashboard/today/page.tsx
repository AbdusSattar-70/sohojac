import {PageHeader} from "@/components/erp/page-header";
import {DailyWorkPanel} from "@/components/dashboard/daily-work-panel";
import {getDailyWorkOverview} from "@/modules/dashboard/daily-work-queries";
import {requirePermission} from "@/modules/platform/auth/erp-context";

export const dynamic="force-dynamic";
export const metadata={title:"Today's work · Sohoj Academy ERP",robots:{index:false,follow:false}};
export default async function TodayPage(){
 const context=await requirePermission("dashboard.view");
 const work=await getDailyWorkOverview(context);
 return (
  <main className="space-y-6">
   <PageHeader eyebrow="Daily work" title="Today"
     description="Start with the next real task, without navigating through setup or accounting terminology."/>
   <DailyWorkPanel work={work}/>
  </main>
 );
}
