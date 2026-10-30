import {z} from "zod";
import {businessDate} from "@/modules/platform/business-date";
const categories=["RENT","UTILITIES","TEACHING_MATERIALS","MARKETING","MAINTENANCE","TRANSPORT","OTHER"] as const;
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{
  const d=new Date(v+"T00:00:00Z");
  return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===v;
});
export const expenseInput=z.object({
  requestId:z.string().uuid(),
  category:z.enum(categories),
  payee:z.string().trim().min(2).max(160),
  description:z.string().trim().min(3).max(500),
  spentOn:date.refine(value=>value<=businessDate()),
  amountPaisa:z.number().int().min(1).max(200000000),
  method:z.enum(["CASH","BANK","MFS"]),
  reason:z.string().trim().min(8).max(500),
}).strict();
export type ExpenseRow={
  id:string;reference:string;category:typeof categories[number];payee:string;
  description:string;spent_on:string;amount_paisa:number;payment_method:string;
  approved_name:string|null;created_at:string;
};

