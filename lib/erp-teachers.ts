import {z} from "zod";
export const teacherAssign=z.object({
  batchId:z.string().uuid(),
  teacherUserId:z.string().min(2).max(160),
  reason:z.string().trim().min(8).max(500),
}).strict();
export const teacherAssignmentPatch=z.object({
  active:z.boolean(),expectedVersion:z.number().int().min(1),
  reason:z.string().trim().min(8).max(500),
}).strict();
export type TeacherAssignment={
  id:string;batch_id:string;batch_name:string;teacher_user_id:string;
  teacher_name:string;teacher_email:string;active:number;version:number;created_at:string;
};
export type MyTeacherBatch={id:string;name:string;offering_name:string};
export type MyTeacherStudent={batch_id:string;student_no:string;student_name:string;class_grade:number};
export type MyTeacherSession={
  id:string;batch_id:string;class_on:string;starts_at:string;ends_at:string;
  title:string;topic:string|null;status:string;
};
export type MyTeacherExam={
  id:string;batch_id:string;title:string;subject:string;held_on:string;max_marks:number;
};
