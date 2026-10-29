import {z} from "zod";
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{
  const d=new Date(v+"T00:00:00.000Z");
  return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===v;
});
const time=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const createSession=z.object({
  batchId:z.string().uuid(),classOn:date,startsAt:time,endsAt:time,
  title:z.string().trim().min(2).max(160),
  topic:z.string().trim().max(500).default(""),
  reason:z.string().trim().min(8).max(500),
}).strict().refine(d=>d.startsAt<d.endsAt,{message:"End must follow start"});
export const changeSession=z.object({
  expectedVersion:z.number().int().min(1),
  nextStatus:z.enum(["HELD","CANCELLED"]),
  reason:z.string().trim().min(8).max(500),
}).strict();
export type SessionRow={
  id:string;batch_id:string;batch_name:string;class_on:string;starts_at:string;ends_at:string;
  title:string;topic:string|null;status:"SCHEDULED"|"HELD"|"CANCELLED";
  created_name:string|null;version:number;
};
