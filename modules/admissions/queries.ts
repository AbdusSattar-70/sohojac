import {env} from "cloudflare:workers";
import {notFound} from "next/navigation";
import {requirePermission} from "@/modules/platform/auth/erp-context";
import {workspaceSchema} from "./schema";

/** Source admission_workspace / offering options on the existing D1 domain
 * records; never read synthetic students from public enquiries.
 */
type Offering={id:string;code:string;name:string;class_name:string;academic_year_name:string;branch_name:string|null;fee_ready:number;};
type Batch={id:string;code:string;name:string;offering_id:string;offering_name:string;class_name:string;academic_year_name:string;branch_name:string|null;capacity:number;occupied:number;status:string;};
type Prospect={id:string;prospect_no:string;student_name:string;guardian_name:string;mobile:string;offering_id:string|null;};
type Case={
 id:string;application_no:string;status:string;created_at:string;batch_id:string|null;
 student_id:string|null;student_no:string|null;student_full_name:string;guardian_full_name:string;
 guardian_mobile:string;school_name:string|null;fee_plan_id:string|null;
 bill_no:string|null;bill_amount_paisa:number|null;bill_issue_on:string|null;
 invoice_paid_paisa:number|null;student_name_bn:string|null;gender:string|null;
 date_of_birth:string|null;school_roll:string|null;guardian_address:string|null;
 alternate_mobile:string|null;guardian_relationship:string|null;
 bill_monthly_paisa:number|null;bill_admission_paisa:number|null;
};
const statusMap:Record<string,string>={
 DRAFT:"DRAFT",REVIEW:"READY",ACCEPTED:"ACCEPTED",
 BILLED:"BILLING_POSTED",ENROLLED:"ACTIVE_ENROLLMENT",
 CANCELLED:"CANCELLED",REJECTED:"CANCELLED"
};
export async function getAdmissionWorkspace() {
 await requirePermission("admissions.view");
 const [offerings,batches,prospects,cases,schools,relationships]=await Promise.all([
  env.DB.prepare([
   "SELECT o.id,o.code,o.name,o.class_name,o.academic_year_name,o.branch_name,",
   "(SELECT COUNT(*) FROM academy_fee_plans f WHERE f.offering_id=o.id AND f.active=1) AS fee_ready",
   "FROM public_programme_offerings o WHERE o.is_active=1 ORDER BY o.name,o.id LIMIT 300"
  ].join(" ")).all<Offering>(),
  env.DB.prepare([
   "SELECT b.id,b.code,b.name,b.offering_id,o.name AS offering_name,o.class_name,",
   "o.academic_year_name,o.branch_name,b.capacity,b.status,",
   "(SELECT COUNT(*) FROM academy_enrollments e WHERE e.batch_id=b.id AND e.status='ACTIVE') AS occupied",
   "FROM academy_batches b JOIN public_programme_offerings o ON o.id=b.offering_id",
   "WHERE b.status IN ('PLANNED','ACTIVE') ORDER BY b.name,b.id LIMIT 400"
  ].join(" ")).all<Batch>(),
  env.DB.prepare([
   "SELECT e.id,p.prospect_no,e.student_name,e.guardian_name,e.mobile,e.offering_id",
   "FROM academy_prospects p JOIN public_enquiries e ON e.id=p.id",
   "LEFT JOIN academy_admissions a ON a.enquiry_id=e.id",
   "WHERE a.id IS NULL AND p.status IN",
   "('CONTACTED','COUNSELLING','TRIAL_SCHEDULED','TRIAL_ATTENDED','REGISTERED','FUTURE_FOLLOW_UP')",
   "ORDER BY p.created_at DESC,p.id DESC LIMIT 300"
  ].join(" ")).all<Prospect>(),
  env.DB.prepare([
   "SELECT a.id,a.application_no,a.status,a.created_at,a.batch_id,a.student_id,",
   "s.student_no,a.student_full_name,a.guardian_full_name,a.guardian_mobile,",
   "a.school_name,a.fee_plan_id,bill.reference AS bill_no,bill.amount_paisa AS bill_amount_paisa,",
   "bill.issue_on AS bill_issue_on,bill.monthly_amount_paisa AS bill_monthly_paisa,",
   "bill.admission_amount_paisa AS bill_admission_paisa,",
   "inv.paid_paisa AS invoice_paid_paisa,",
   "d.student_name_bn,d.gender,d.date_of_birth,d.school_roll,d.guardian_address,",
   "d.alternate_mobile,d.guardian_relationship",
   "FROM academy_admissions a",
   "LEFT JOIN academy_students s ON s.id=a.student_id",
   "LEFT JOIN academy_admission_bills bill ON bill.admission_id=a.id",
   "LEFT JOIN finance_invoices inv ON inv.id=(SELECT i2.id FROM finance_invoices i2",
   "WHERE i2.admission_id=a.id ORDER BY i2.issue_on,i2.created_at,i2.id LIMIT 1)",
   "LEFT JOIN academy_admission_intake_details d ON d.admission_id=a.id",
   "ORDER BY a.created_at DESC,a.id DESC LIMIT 300"
  ].join(" ")).all<Case>(),
  env.DB.prepare("SELECT id,name FROM academy_schools WHERE is_active=1 ORDER BY name LIMIT 300").all<{id:string;name:string}>(),
  env.DB.prepare("SELECT id,name FROM academy_guardian_relationships WHERE is_active=1 ORDER BY name LIMIT 100").all<{id:string;name:string}>()
 ]);
 return workspaceSchema.parse({
  directory:{schools:schools.results??[],relationships:relationships.results??[]},
  capacityLimit:null,
  offerings:(offerings.results??[]).map(o=>({
   id:o.id,name:o.name,code:o.code,classId:null,
   className:o.class_name,yearName:o.academic_year_name,
   branchName:o.branch_name,feeReady:o.fee_ready>0
  })),
  batches:(batches.results??[]).map(b=>({
   id:b.id,code:b.code,name:b.name,offeringId:b.offering_id,
   offeringName:b.offering_name,classId:null,className:b.class_name,
   yearName:b.academic_year_name,branchName:b.branch_name,
   capacity:b.capacity,occupied:b.occupied,isActive:b.status==="ACTIVE",
   scheduleSummary:null
  })),
  prospects:(prospects.results??[]).map(p=>({
   id:p.id,name:p.student_name,number:p.prospect_no,classId:null,
   interestedOfferingId:p.offering_id,guardian:p.guardian_name,mobile:p.mobile
  })),
  paymentMethods:[],
  cases:(cases.results??[]).map(a=>{
   const billed=a.bill_amount_paisa!==null;
   const total=(a.bill_amount_paisa??0)/100,paid=(a.invoice_paid_paisa??0)/100;
   return {
    id:a.id,number:a.application_no,status:statusMap[a.status]??"DRAFT",
    createdAt:a.created_at,batchId:a.batch_id,existingStudent:false,
    studentNo:a.student_no,studentId:a.student_id,
    name:a.student_full_name,nameBn:a.student_name_bn,
    gender:a.gender,dateOfBirth:a.date_of_birth,schoolName:a.school_name,
    schoolRoll:a.school_roll,guardianAddress:a.guardian_address,
    alternateMobile:a.alternate_mobile,guardianRelationship:a.guardian_relationship,
    guardian:a.guardian_full_name,mobile:a.guardian_mobile,
    feeVersion:1,feePlanId:a.fee_plan_id,policyVersion:null,
    paymentRequirement:null,
    components:billed?[
     {name:"Monthly fee",amount:(a.bill_monthly_paisa??0)/100,recurrence:"MONTHLY"},
     {name:"Admission fee",amount:(a.bill_admission_paisa??0)/100,recurrence:"ONE_TIME"}
    ]:[],
    invoice:billed?{
     number:a.bill_no??"",total,dueOn:a.bill_issue_on??"",
     paid,credits:0,net:total,refunded:0,due:Math.max(0,total-paid),credit:0
    }:null,
    receipts:[]
   };
  })
 });
}

type CaseDetail={
 id:string;application_no:string;enquiry_id:string|null;intent:string|null;
 status:string;created_at:string;batch_id:string|null;
 batch_name:string|null;batch_code:string|null;batch_capacity:number|null;batch_occupied:number|null;
 offering_id:string;offering_name:string;class_name:string;academic_year_name:string;branch_name:string|null;
 student_id:string|null;student_no:string|null;student_full_name:string;guardian_full_name:string;guardian_mobile:string;
 school_name:string|null;fee_plan_id:string|null;
 bill_id:string|null;bill_no:string|null;bill_amount_paisa:number|null;bill_monthly_paisa:number|null;
 bill_admission_paisa:number|null;bill_issue_on:string|null;
 invoice_no:string|null;invoice_due_on:string|null;invoice_paid_paisa:number|null;
 student_name_bn:string|null;gender:string|null;date_of_birth:string|null;school_roll:string|null;
 guardian_address:string|null;alternate_mobile:string|null;guardian_relationship:string|null;
};
type Receipt={
 receipt_no:string;amount_paisa:number;received_at:string;payment_method:string;
};
/** Original per-case print/identity contract. Read-only and fail-closed. */
export async function getAdmissionCase(admissionId:string){
 await requirePermission("admissions.view");
 const [caseRow,payments]=await Promise.all([
  env.DB.prepare([
   "SELECT a.id,a.application_no,a.enquiry_id,e.intent,a.status,a.created_at,a.batch_id,",
   "b.name AS batch_name,b.code AS batch_code,b.capacity AS batch_capacity,",
   "(SELECT COUNT(*) FROM academy_enrollments en WHERE en.batch_id=b.id AND en.status='ACTIVE') AS batch_occupied,",
   "a.offering_id,o.name AS offering_name,o.class_name,o.academic_year_name,o.branch_name,",
   "a.student_id,s.student_no,a.student_full_name,a.guardian_full_name,a.guardian_mobile,",
   "a.school_name,a.fee_plan_id,bill.id AS bill_id,bill.reference AS bill_no,",
   "bill.amount_paisa AS bill_amount_paisa,bill.monthly_amount_paisa AS bill_monthly_paisa,",
   "bill.admission_amount_paisa AS bill_admission_paisa,bill.issue_on AS bill_issue_on,",
   "inv.invoice_no,inv.due_on AS invoice_due_on,inv.paid_paisa AS invoice_paid_paisa,",
   "d.student_name_bn,d.gender,d.date_of_birth,d.school_roll,d.guardian_address,",
   "d.alternate_mobile,d.guardian_relationship",
   "FROM academy_admissions a",
   "JOIN public_programme_offerings o ON o.id=a.offering_id",
   "LEFT JOIN public_enquiries e ON e.id=a.enquiry_id",
   "LEFT JOIN academy_batches b ON b.id=a.batch_id",
   "LEFT JOIN academy_students s ON s.id=a.student_id",
   "LEFT JOIN academy_admission_bills bill ON bill.admission_id=a.id",
   "LEFT JOIN finance_invoices inv ON inv.id=(SELECT i2.id FROM finance_invoices i2",
   "WHERE i2.admission_id=a.id ORDER BY i2.issue_on,i2.created_at,i2.id LIMIT 1)",
   "LEFT JOIN academy_admission_intake_details d ON d.admission_id=a.id",
   "WHERE a.id=?"
  ].join(" ")).bind(admissionId).first<CaseDetail>(),
  env.DB.prepare([
   "SELECT p.receipt_no,al.amount_paisa,p.received_at,p.payment_method",
   "FROM finance_payments p JOIN finance_allocations al ON al.payment_id=p.id",
   "JOIN finance_invoices inv ON inv.id=al.invoice_id",
   "WHERE inv.admission_id=? ORDER BY p.received_at,p.id LIMIT 100"
  ].join(" ")).bind(admissionId).all<Receipt>()
 ]);
 if(!caseRow)notFound();
 const a=caseRow;
 const hasBill=a.bill_id!==null,total=(a.bill_amount_paisa??0)/100;
 const paid=(a.invoice_paid_paisa??0)/100;
 const payload={
  id:a.id,number:a.application_no,status:statusMap[a.status]??"DRAFT",createdAt:a.created_at,
  existingStudent:false,
  origin:a.enquiry_id?(a.intent==="admission"?"PUBLIC_APPLICATION":"PROSPECT_CONVERSION"):"DIRECT_STAFF",
  originProspectId:a.enquiry_id,
  batchId:a.batch_id,batchName:a.batch_name??"Unassigned",batchCode:a.batch_code??"",
  batchCapacity:a.batch_capacity??0,batchOccupied:a.batch_occupied??0,
  offeringId:a.offering_id,offeringName:a.offering_name,
  className:a.class_name,yearName:a.academic_year_name,branchName:a.branch_name,
  studentNo:a.student_no,studentId:a.student_id,
  name:a.student_full_name,nameBn:a.student_name_bn,
  gender:a.gender,dateOfBirth:a.date_of_birth,schoolName:a.school_name,
  schoolRoll:a.school_roll,guardianAddress:a.guardian_address,
  alternateMobile:a.alternate_mobile,guardianRelationship:a.guardian_relationship,
  guardian:a.guardian_full_name,mobile:a.guardian_mobile,
  feeVersion:1,feePlanId:a.fee_plan_id,policyVersion:null,paymentRequirement:null,
  tuitionTotal:total,
  components:hasBill?[
   {name:"Monthly fee",amount:(a.bill_monthly_paisa??0)/100,recurrence:"MONTHLY"},
   {name:"Admission fee",amount:(a.bill_admission_paisa??0)/100,recurrence:"ONE_TIME"}
  ]:[],
  invoice:hasBill?{
   id:a.bill_id,number:a.invoice_no??a.bill_no??"",
   total,net:total,dueOn:a.invoice_due_on??"",
   paid,credits:0,refunded:0,due:Math.max(0,total-paid),credit:0
  }:null,
  receipts:(payments.results??[]).map(p=>({
   number:p.receipt_no,amount:p.amount_paisa/100,
   postedAt:p.received_at,method:p.payment_method,refunded:0
  }))
 };
 const {admissionCaseDetailSchema}=await import("./schema");
 return admissionCaseDetailSchema.parse(payload);
}
