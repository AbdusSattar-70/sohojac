import {z} from "zod";

const code=z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,40}$/);
const text=(max:number)=>z.string().trim().max(max);
export const createOfferingSchema=z.object({
  code,
  name:text(160).min(2),
  className:text(80).min(2),
  academicYearName:text(80).min(2),
  branchName:text(120).min(2),
  groupName:text(80).default(""),
  reason:text(500).min(8),
}).strict();
export const offeringUpdateSchema=z.object({
  expectedVersion:z.number().int().min(1),
  name:text(160).min(2),
  className:text(80).min(2),
  academicYearName:text(80).min(2),
  branchName:text(120).min(2),
  groupName:text(80).default(""),
  showcaseTitle:text(120),
  showcaseTitleBn:text(120),
  showcaseDescription:text(400),
  showcaseDescriptionBn:text(400),
  publicSchedule:text(300),
  publicScheduleBn:text(300),
  showOnWebsite:z.boolean(),
  isActive:z.boolean(),
  applicationState:z.enum(["CLOSED","UPCOMING","OPEN"]),
  sortOrder:z.number().int().min(0).max(10000),
  reason:text(500).min(8),
}).strict().refine(value=>
  value.applicationState!=="OPEN"||(value.showOnWebsite&&value.isActive),{
    message:"Applications can open only for an active, published programme",
  });
export type StaffOffering={
  id:string;code:string;name:string;class_name:string;academic_year_name:string;
  branch_name:string;group_name:string|null;
  showcase_title:string|null;showcase_title_bn:string|null;
  showcase_description:string|null;showcase_description_bn:string|null;
  public_schedule:string|null;public_schedule_bn:string|null;
  show_on_website:number;is_active:number;is_accepting_applications:number;
  application_state:"CLOSED"|"UPCOMING"|"OPEN";
  showcase_sort_order:number;version:number;
  current_open_seats:number;current_total_seats:number;active_batch_count:number;
};
