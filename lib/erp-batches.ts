import {z} from "zod";

const date=z.union([z.literal(""),z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);
const name=z.string().trim().min(2).max(160);
const code=z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,40}$/);
const reason=z.string().trim().min(5).max(500);
const capacity=z.number().int().min(1).max(12);
const requestId=z.string().uuid();
const expectedVersion=z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const status=z.enum(["PLANNED","ACTIVE","COMPLETED","CANCELLED"]);
const validDates=(v:{beginsOn?:string;endsOn?:string})=>!v.beginsOn||!v.endsOn||v.beginsOn<=v.endsOn;
const dateError={message:"End date cannot precede start date"};

/** Compatibility envelopes; adapters also require a body or header request identity. */
export const batchCreate=z.object({
  requestId:requestId.optional(),code,offeringId:z.string().min(2).max(100),
  yearId:z.string().max(100).default(""),name,capacity,
  beginsOn:date.default(""),endsOn:date.default(""),reason,
}).strict().refine(validDates,dateError);
export const batchPatch=z.object({
  requestId:requestId.optional(),code:code.optional(),name,capacity,
  beginsOn:date.default(""),endsOn:date.default(""),expectedVersion,nextStatus:status,reason,
}).strict().refine(validDates,dateError);

/** Every transport enters this bounded domain contract before any database access. */
export const batchCommandSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("CREATE_BATCH"),requestId,reason,code,name,capacity,
    offeringId:z.string().min(2).max(100),yearId:z.string().max(100).default(""),
    beginsOn:date.default(""),endsOn:date.default(""),nextStatus:z.enum(["PLANNED","ACTIVE"]).default("ACTIVE"),
  }).strict(),
  z.object({action:z.literal("EDIT_BATCH"),requestId,reason,batchId:z.string().uuid(),expectedVersion,
    code:code.optional(),name,capacity,beginsOn:date.optional(),endsOn:date.optional(),nextStatus:status.optional(),
  }).strict(),
  z.object({action:z.literal("SET_BATCH_STATE"),requestId,reason,batchId:z.string().uuid(),expectedVersion,
    nextStatus:z.enum(["PLANNED","ACTIVE"]),
  }).strict(),
]).refine(v=>v.action==="SET_BATCH_STATE"||validDates(v),dateError);
export type BatchCommand=z.infer<typeof batchCommandSchema>;
export type BatchStatus=z.infer<typeof status>;
export type BatchRow={
  id:string;code:string;name:string;offering_id:string;offering_name:string;
  year_id:string|null;year_title:string|null;capacity:number;
  begins_on:string|null;ends_on:string|null;status:BatchStatus;
  enrolled_count:number;version:number;
};
