import {z} from "zod";
const identifier=z.string().min(2).max(100);
const name=z.string().trim().min(2).max(160);
const mobile=z.string().regex(/^01[3-9]\d{8}$/);
const reason=z.string().trim().min(8).max(500);
const identity={
  studentName:name,classGrade:z.number().int().min(1).max(12),
  guardianName:name,guardianMobile:mobile,schoolName:z.string().trim().max(160),
};
export const createAdmission=z.object({
  offeringId:identifier,enquiryId:z.string().max(100).default(""),...identity,
  reason,
}).strict();
export const patchAdmission=z.discriminatedUnion("action",[
  z.object({action:z.literal("SAVE"),expectedVersion:z.number().int().min(1),...identity,reason}).strict(),
  z.object({action:z.literal("REVIEW"),expectedVersion:z.number().int().min(1),reason}).strict(),
  z.object({action:z.literal("ACCEPT"),expectedVersion:z.number().int().min(1),
    batchId:identifier,feePlanId:identifier,consentVerified:z.literal(true),reason}).strict(),
  z.object({action:z.literal("REJECT"),expectedVersion:z.number().int().min(1),reason}).strict(),
]);
export type AdmissionStatus="DRAFT"|"REVIEW"|"ACCEPTED"|"BILLED"|"ENROLLED"|"REJECTED"|"CANCELLED";
export type AdmissionRow={
  id:string;application_no:string;enquiry_id:string|null;
  offering_id:string;offering_name:string;status:AdmissionStatus;
  student_full_name:string;class_grade:number;
  guardian_full_name:string;guardian_mobile:string;school_name:string|null;
  batch_id:string|null;batch_name:string|null;fee_plan_id:string|null;
  fee_plan_title:string|null;review_note:string|null;consent_verified:number;
  prepared_by:string;verified_by:string|null;approved_by:string|null;
  created_at:string;version:number;
};
