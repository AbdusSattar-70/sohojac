import {env} from "cloudflare:workers";
import {requirePermission} from "@/modules/platform/auth/erp-context";
import {MessageSafetyWorkspace,type OutboxItem,type StudentChoice} from "@/modules/communications/message-safety-workspace";

export const dynamic="force-dynamic";
export default async function GuardianMessagesPage(){
 const context=await requirePermission("audit.view");
 const [queued,students]=await Promise.all([
  env.DB.prepare(
   "SELECT o.id,o.student_id,s.student_no,s.full_name,o.template_key,o.status,o.created_at,"+
   "CASE WHEN p.student_id IS NOT NULL OR g.guardian_mobile IS NOT NULL THEN 1 ELSE 0 END AS opted_out "+
   "FROM guardian_message_outbox o JOIN academy_students s ON s.id=o.student_id "+
   "LEFT JOIN guardian_sms_optouts p ON p.student_id=o.student_id "+
   "LEFT JOIN guardian_sms_contact_suppressions g ON g.guardian_mobile=s.guardian_mobile "+
   "ORDER BY o.created_at DESC,o.id DESC LIMIT 100").all<OutboxItem>(),
  env.DB.prepare(
   "SELECT s.id,s.student_no,s.full_name,"+
   "CASE WHEN p.student_id IS NULL THEN 0 ELSE 1 END AS opted_out "+
   "FROM academy_students s LEFT JOIN guardian_sms_optouts p ON p.student_id=s.id "+
   "WHERE s.merged_into_id IS NULL AND s.status='ACTIVE' "+
   "ORDER BY s.created_at DESC,s.id DESC LIMIT 300").all<StudentChoice>()
 ]);
 return <MessageSafetyWorkspace messages={queued.results??[]} students={students.results??[]}
   canManage={context.permissions.includes("communications.manage")}/>;
}
