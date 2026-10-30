import {retiredAdmissionMutation} from "@/lib/retired-admission-mutation";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
export async function POST(request:Request,context:Context){
  const {id}=await context.params;
  return retiredAdmissionMutation(request,id);
}
