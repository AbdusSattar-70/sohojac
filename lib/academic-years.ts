import {z} from "zod";

const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/,"Use YYYY-MM-DD");
const optionalDate=z.union([date,z.literal("")]).default("");

export const yearInput=z.object({
  code:z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,24}$/),
  title:z.string().trim().min(3).max(100),
  startsOn:optionalDate,
  endsOn:optionalDate,
}).strict().refine(row=>!row.startsOn||!row.endsOn||row.endsOn>=row.startsOn,{
  message:"End date must be on or after start date",
});
export const yearPatch=z.object({
  title:z.string().trim().min(3).max(100),
  startsOn:optionalDate,
  endsOn:optionalDate,
  expectedVersion:z.number().int().min(1).max(100000),
  nextStatus:z.enum(["DRAFT","ACTIVE","CLOSED"]),
  reason:z.string().trim().min(8).max(500),
}).strict().refine(row=>!row.startsOn||!row.endsOn||row.endsOn>=row.startsOn,{
  message:"End date must be on or after start date",
});

export type AcademicYearRow={
  id:string;code:string;title:string;starts_on:string|null;ends_on:string|null;
  status:"DRAFT"|"ACTIVE"|"CLOSED";version:number;
};
