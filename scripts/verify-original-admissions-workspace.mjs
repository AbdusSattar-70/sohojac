import fs from "node:fs";
import crypto from "node:crypto";
const read=p=>fs.readFileSync(p,"utf8");
const hash=p=>{const b=fs.readFileSync(p);return crypto.createHash("sha1").update("blob "+b.length+"\0").update(b).digest("hex");};
if(hash("app/dashboard/admissions/page.tsx")!=="6b44a46a490bdca35ec43f8591223929dcb608bc")throw Error("Original admissions register page source drift");
{
 const page=read("app/dashboard/admissions/page.tsx");
 for(const marker of ["Start an admission","Already in Enquiries","New applicant with staff assistance","Paper application","Admission cases","getAdmissionWorkspace"])
  if(!page.includes(marker))throw Error("Original admissions register missing "+marker);
}
const intake=read("modules/admissions/intake-actions.ts"), conversion=read("modules/admissions/actions.ts"),
 workspace=read("modules/admissions/queries.ts"), schema=read("modules/admissions/schema.ts"),
 migration=read("migrations/0027_source_admission_intake.sql");
for(const [file,src] of [["intake",intake],["conversion",conversion]]){
 for(const marker of ["admissions.create","academy_admissions","erp_audit_events","academy_admission_request_keys","env.DB.batch","status","DRAFT"]){
  if(!src.includes(marker))throw Error(file+" action missing "+marker);
 }
 if(/supabase|rpc-client/.test(src))throw Error(file+" still uses legacy backend");
}
for(const marker of ["academy_prospects","academy_admissions","academy_batches","academy_admission_intake_details","workspaceSchema.parse"])
 if(!workspace.includes(marker))throw Error("Source D1 workspace read missing "+marker);
for(const marker of ["academy_admission_intake_details","request_id TEXT NOT NULL UNIQUE","academy_admission_request_keys","REFERENCES academy_admissions"])
 if(!migration.includes(marker))throw Error("Admission intake migration missing "+marker);
if(!schema.includes('const option = z.object({ id: z.string().min(2).max(100)'))
 throw Error("Pinned original source IDs must accept existing non-UUID D1 offering keys");
if(!read("modules/admissions/intake-schema.ts").includes("offeringId: z.string().min(2).max(100)"))
 throw Error("Source intake rejects existing D1 offering keys");
console.log("Original Admissions register and guarded D1 staff/CRM draft adapters verified.");
