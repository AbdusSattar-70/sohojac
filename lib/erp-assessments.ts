import {z} from "zod";
const validDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{
  const d=new Date(value+"T00:00:00Z");
  return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===value;
});
export const newAssessment=z.object({
  batchId:z.string().uuid(),
  title:z.string().trim().min(2).max(160),
  subject:z.string().trim().min(2).max(120),
  heldOn:validDate,maxMarks:z.number().int().min(1).max(1000),
  reason:z.string().trim().min(8).max(500),
}).strict();
export const markInput=z.object({
  enrollmentId:z.string().uuid(),marks:z.number().int().min(0).max(1000),
  note:z.string().trim().max(500).default(""),
  expectedVersion:z.number().int().min(0),
  reason:z.string().trim().min(8).max(500),
}).strict();
export const publishAssessment=z.object({
  expectedVersion:z.number().int().min(1),
  reason:z.string().trim().min(8).max(500),
}).strict();
export type AssessmentRow={
  id:string;batch_id:string;batch_name:string;title:string;subject:string;
  held_on:string;max_marks:number;status:"DRAFT"|"PUBLISHED";version:number;
};
export type ExamEnrollment={
  enrollment_id:string;batch_id:string;student_no:string;student_name:string;
};
export type ExamResult={
  id:string;assessment_id:string;enrollment_id:string;
  obtained_marks:number;version:number;note:string|null;
};
