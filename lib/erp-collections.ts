import {z} from "zod";
export const collectionInput=z.object({
  invoiceId:z.string().uuid(),
  amountPaisa:z.number().int().min(1).max(200000000),
  method:z.enum(["CASH","BANK","MFS"]),
  reference:z.string().trim().max(160).default(""),
  reason:z.string().trim().min(8).max(500),
}).strict();
export type CollectionInvoice={
  id:string;invoice_no:string;student_id:string;student_no:string;student_name:string;
  issue_on:string;amount_paisa:number;paid_paisa:number;status:string;
};
export type CollectionReceipt={
  id:string;receipt_no:string;invoice_no:string;student_name:string;
  amount_paisa:number;payment_method:string;received_at:string;reference:string|null;
};
