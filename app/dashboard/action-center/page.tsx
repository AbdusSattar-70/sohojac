import {redirect} from "next/navigation";
/** Old navigation deep links resolve to the real task-first workspace. */
export default function FormerActionCenterPage(){
 redirect("/dashboard/today");
}
