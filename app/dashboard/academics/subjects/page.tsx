import {redirect} from "next/navigation";

/** Subjects are one ordinary master-data entity, managed with Classes and Groups. */
export default function SubjectsPage(){
 redirect("/dashboard/academics/settings?section=subject");
}
