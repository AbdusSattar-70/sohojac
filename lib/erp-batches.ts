import {z} from "zod";

const date=z.union([z.literal(""),z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).default("");
const name=z.string().trim().min(2).max(120);
const code=z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,32}$/);
const reason=z.string().trim().min(8).max(500);
const capacity=z.number().int().min(1).max(12);
const shared={name,capacity,beginsOn:date,endsOn:date};
export const batchCreate=z.object({
  code,offeringId:z.string().min(2).max(100),yearId:z.string().max(100).default(""),
  ...shared,reason,
}).strict().refine(v=>!v.beginsOn||!v.endsOn||v.beginsOn<=v.endsOn,{
  message:"End date cannot precede start date",
});
export const batchPatch=z.object({
  ...shared,expectedVersion:z.number().int().min(1),
  nextStatus:z.enum(["PLANNED","ACTIVE","COMPLETED","CANCELLED"]),reason,
}).strict().refine(v=>!v.beginsOn||!v.endsOn||v.beginsOn<=v.endsOn,{
  message:"End date cannot precede start date",
});
export type BatchRow={
  id:string;code:string;name:string;offering_id:string;offering_name:string;
  year_id:string|null;year_title:string|null;capacity:number;
  begins_on:string|null;ends_on:string|null;
  status:"PLANNED"|"ACTIVE"|"COMPLETED"|"CANCELLED";
  enrolled_count:number;version:number;
};
