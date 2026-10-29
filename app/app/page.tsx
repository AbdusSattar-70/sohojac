import {redirect} from "next/navigation";
export const dynamic="force-dynamic";
export const metadata={title:"Digital Campus · Sohoj Academy",robots:{index:false,follow:false}};
/** All authenticated users enter the source ERP dashboard. That dashboard
 * routes teachers and other limited-access staff to their permitted home. */
export default function LegacyAppHome(){
 redirect("/dashboard");
}
