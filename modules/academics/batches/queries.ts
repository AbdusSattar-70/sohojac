import {env} from "cloudflare:workers";
import {requirePermission} from "@/modules/platform/auth/erp-context";
import {workspaceSchema,type AdmissionWorkspace} from "@/modules/admissions/schema";
/** Original Batch Register contract, without admission/prospect or money reads. */
export async function getBatchWorkspace():Promise<AdmissionWorkspace>{
 await requirePermission("academics.view");
 const [offerings,batches]=await Promise.all([
  env.DB.prepare([
   "SELECT o.id,o.code,o.name,o.class_id,o.class_name,o.academic_year_name,o.branch_name,",
   "CASE WHEN o.is_active=1 AND o.branch_id IS NOT NULL AND o.program_id IS NOT NULL AND o.operation_kind IS NOT NULL",
   "AND EXISTS(SELECT 1 FROM academy_branches b WHERE b.id=o.branch_id AND b.is_active=1)",
   "AND EXISTS(SELECT 1 FROM academy_programmes p WHERE p.id=o.program_id AND p.active=1)",
   "AND (o.operation_kind='TRAINING' OR (o.academic_year_id IS NOT NULL AND o.class_id IS NOT NULL))",
   "AND EXISTS(SELECT 1 FROM academy_fee_plans f WHERE f.offering_id=o.id AND f.active=1",
   "AND (f.source_version IS NULL OR (f.source_status='ACTIVE' AND f.effective_from<=date('now','+6 hours')))) THEN 1 ELSE 0 END AS fee_ready",
   "FROM public_programme_offerings o ORDER BY o.created_at DESC,o.id"
  ].join(" ")).all<{id:string;code:string;name:string;class_id:string|null;class_name:string;academic_year_name:string;branch_name:string|null;fee_ready:number}>(),
  env.DB.prepare([
   "SELECT b.id,b.code,b.name,b.offering_id,b.capacity,b.status,b.version,o.name AS offering_name,o.class_id,o.class_name,",
   "COALESCE(y.title,o.academic_year_name) AS year_name,o.branch_name,",
   "(SELECT COUNT(*) FROM academy_enrollments e WHERE e.batch_id=b.id AND e.status='ACTIVE') AS occupied,",
   "(SELECT MIN(s.class_on) FROM academy_class_sessions s WHERE s.batch_id=b.id AND s.status='SCHEDULED' AND s.class_on>=date('now','+6 hours')) AS next_session",
   "FROM academy_batches b JOIN public_programme_offerings o ON o.id=b.offering_id",
   "LEFT JOIN academic_years y ON y.id=b.year_id ORDER BY b.created_at DESC,b.id"
  ].join(" ")).all<{id:string;code:string;name:string;offering_id:string;capacity:number;status:string;version:number;offering_name:string;class_id:string|null;class_name:string;year_name:string;branch_name:string|null;occupied:number;next_session:string|null}>()
 ]);
 return workspaceSchema.parse({
  directory:{schools:[],relationships:[]},capacityLimit:12,
  offerings:(offerings.results??[]).map(o=>({id:o.id,code:o.code,name:o.name,classId:o.class_id,className:o.class_name,yearName:o.academic_year_name,branchName:o.branch_name,feeReady:o.fee_ready===1})),
  batches:(batches.results??[]).map(b=>({id:b.id,code:b.code,name:b.name,offeringId:b.offering_id,offeringName:b.offering_name,classId:b.class_id,className:b.class_name,yearName:b.year_name,branchName:b.branch_name,capacity:b.capacity,occupied:b.occupied,isActive:b.status==="ACTIVE",version:b.version,scheduleSummary:b.next_session?"Next scheduled class: "+b.next_session:null})),
  prospects:[],paymentMethods:[],cases:[]
 });
}
