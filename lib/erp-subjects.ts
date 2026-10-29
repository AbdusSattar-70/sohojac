import {z} from "zod";
const name=z.string().trim().min(2).max(120);
const reason=z.string().trim().min(8).max(500);
export const createSubject=z.object({
  code:z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,16}$/),name,
  classGrade:z.number().int().min(4).max(12),
  group:z.enum(["GENERAL","SCIENCE","BUSINESS","HUMANITIES"]),reason,
}).strict();
export const modifySubject=z.object({
  expectedVersion:z.number().int().min(1),name,active:z.boolean(),reason,
}).strict();
export const assignSubject=z.object({
  offeringId:z.string().min(2).max(100),subjectId:z.string().min(2).max(100),
  expectedOfferingVersion:z.number().int().min(1),
  action:z.enum(["ADD","REMOVE"]),reason,
}).strict();
export type SubjectRow={
  id:string;code:string;name:string;class_grade:number;group_name:string;
  active:number;version:number;
};
export type OfferingSubjectRow={
  id:string;name:string;version:number;subjects_json:string;
};
