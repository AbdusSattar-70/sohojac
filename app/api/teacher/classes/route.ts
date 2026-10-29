import {env} from "cloudflare:workers";
import {getStaffAccess,privateJson} from "@/lib/staff-access";
import type {MyTeacherBatch,MyTeacherExam,MyTeacherSession,MyTeacherStudent} from "@/lib/erp-teachers";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  const staff=await getStaffAccess(request.url,request.headers);
  if(!staff)return privateJson({error:"Authentication required"},401);
  if(staff.role!=="TEACHER")return privateJson({error:"Teacher workspace only"},403);
  try{
    const [batches,students,sessions,exams]=await Promise.all([
      env.DB.prepare([
        "SELECT b.id,b.name,p.name AS offering_name FROM academy_batch_teachers a",
        "JOIN academy_batches b ON b.id=a.batch_id AND b.status='ACTIVE'",
        "JOIN public_programme_offerings p ON p.id=b.offering_id",
        "WHERE a.teacher_user_id=? AND a.active=1 ORDER BY b.name LIMIT 100"
      ].join(" ")).bind(staff.userId).all<MyTeacherBatch>(),
      env.DB.prepare([
        "SELECT e.batch_id,s.student_no,s.full_name AS student_name,s.class_grade",
        "FROM academy_enrollments e JOIN academy_students s ON s.id=e.student_id",
        "WHERE e.status='ACTIVE' AND EXISTS(SELECT 1 FROM academy_batch_teachers a",
        "JOIN academy_batches b ON b.id=a.batch_id AND b.status='ACTIVE'",
        "WHERE a.batch_id=e.batch_id AND a.teacher_user_id=? AND a.active=1)",
        "ORDER BY e.batch_id,s.student_no LIMIT 500"
      ].join(" ")).bind(staff.userId).all<MyTeacherStudent>(),
      env.DB.prepare([
        "SELECT s.id,s.batch_id,s.class_on,s.starts_at,s.ends_at,s.title,s.topic,s.status",
        "FROM academy_class_sessions s",
        "WHERE s.class_on>=date('now','-30 days') AND EXISTS(",
        "SELECT 1 FROM academy_batch_teachers a JOIN academy_batches b",
        "ON b.id=a.batch_id AND b.status='ACTIVE'",
        "WHERE a.batch_id=s.batch_id AND a.teacher_user_id=? AND a.active=1)",
        "ORDER BY s.class_on DESC,s.starts_at DESC LIMIT 200"
      ].join(" ")).bind(staff.userId).all<MyTeacherSession>(),
      env.DB.prepare([
        "SELECT a.id,a.batch_id,a.title,a.subject,a.held_on,a.max_marks",
        "FROM academy_assessments a WHERE a.status='PUBLISHED' AND EXISTS(",
        "SELECT 1 FROM academy_batch_teachers t JOIN academy_batches b",
        "ON b.id=t.batch_id AND b.status='ACTIVE'",
        "WHERE t.batch_id=a.batch_id AND t.teacher_user_id=? AND t.active=1)",
        "ORDER BY a.held_on DESC LIMIT 100"
      ].join(" ")).bind(staff.userId).all<MyTeacherExam>(),
    ]);
    return privateJson({batches:batches.results??[],students:students.results??[],
      sessions:sessions.results??[],exams:exams.results??[]});
  }catch{return privateJson({error:"Classroom workspace unavailable"},503);}
}
