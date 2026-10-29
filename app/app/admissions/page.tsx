import {redirect} from "next/navigation";
export const dynamic="force-dynamic";
export const metadata={title:"Admissions · Sohoj Academy ERP",robots:{index:false,follow:false}};
/** Compatibility: the original source ERP is the single canonical Admissions surface.
 * Old bookmarks must never render the parallel simplified workbench. */
export default async function LegacyAdmissionsPage({searchParams}:{
 searchParams:Promise<{start?:string;prospect?:string;view?:string}>;
}){
 const q=await searchParams;
 const params=new URLSearchParams();
 if(q.start==="staff"||q.start==="enquiry")params.set("start",q.start);
 if(q.prospect&&/^[a-f0-9-]{36}$/i.test(q.prospect))params.set("prospect",q.prospect);
 if(q.view==="open"||q.view==="completed"||q.view==="closed")params.set("view",q.view);
 redirect("/dashboard/admissions"+(params.size?"?"+params.toString():""));
}
