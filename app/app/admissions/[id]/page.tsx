import {redirect,notFound} from "next/navigation";
import {z} from "zod";
export const dynamic="force-dynamic";
/** Deep links created by the retired admissions list resolve to the source case. */
export default async function LegacyAdmissionCase({params}:{
 params:Promise<{id:string}>;
}){
 const {id}=await params;
 if(!z.string().uuid().safeParse(id).success)notFound();
 redirect("/dashboard/admissions/"+id);
}
