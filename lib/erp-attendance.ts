import {z} from "zod";
const validDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{
  const date=new Date(value+"T00:00:00.000Z");
  return !Number.isNaN(date.valueOf())&&date.toISOString().slice(0,10)===value;
});
export const attendanceInput=z.object({
  enrollmentId:z.string().uuid(),classOn:validDate,
  state:z.enum(["PRESENT","ABSENT","LATE","EXCUSED"]),
  expectedVersion:z.number().int().min(0).max(999999),
  reason:z.string().trim().min(8).max(500),
}).strict();
export type AttendanceRow={
  enrollment_id:string;student_no:string;student_name:string;
  attendance_id:string|null;state:"PRESENT"|"ABSENT"|"LATE"|"EXCUSED"|null;
  version:number|null;
};
