import {z} from "zod";
const paisa=z.number().int().min(0).max(200000000);
const title=z.string().trim().min(2).max(120);
const reason=z.string().trim().min(8).max(500);
export const createFeePlan=z.object({
  offeringId:z.string().min(2).max(100),title,
  monthlyAmountPaisa:paisa,admissionAmountPaisa:paisa,reason,
}).strict();
export const updateFeePlan=z.object({
  title,monthlyAmountPaisa:paisa,admissionAmountPaisa:paisa,
  active:z.boolean(),expectedVersion:z.number().int().min(1),reason,
}).strict();
export type FeePlanRow={
  id:string;offering_id:string;offering_name:string;title:string;
  monthly_amount_paisa:number;admission_amount_paisa:number;
  active:number;version:number;
};
