import fs from "node:fs";
import crypto from "node:crypto";
const manifest=JSON.parse(fs.readFileSync("docs/source-first-erp-manifest.json","utf8"));
for(const path of [
 "app/dashboard/crm/prospects/page.tsx",
 "modules/crm/components/prospect-table.tsx",
 "modules/crm/components/prospect-followup-form.tsx",
 "modules/crm/components/prospect-assignment-form.tsx",
 "modules/crm/prospect-status.ts",
 "modules/crm/schema.ts",
 "components/erp/workflow-guide.tsx"
]){
 const entry=[...manifest.dashboardPages,...manifest.modules,...manifest.erpComponents].find(x=>x.path===path);
 if(!entry)throw Error("CRM source manifest missing "+path);
 const buffer=fs.readFileSync(path);
 const blob=crypto.createHash("sha1").update("blob "+buffer.length+"\0").update(buffer).digest("hex");
 if(blob!==entry.blob)throw Error("Source CRM UI/schema drift detected "+path);
}
const read=p=>fs.readFileSync(p,"utf8");
const migration=read("migrations/0026_original_crm_prospects.sql");
for(const invariant of [
 "seq INTEGER PRIMARY KEY AUTOINCREMENT",
 "LEGACY_CLOSED","tr_new_public_enquiry_prospect",
 "AFTER INSERT ON public_enquiries", "AFTER UPDATE OF status ON public_enquiries",
 "academy_prospect_followups","ON DELETE RESTRICT"
])if(!migration.includes(invariant))throw Error("CRM D1 missing "+invariant);
if(migration.includes("THEN 'LOST'")||migration.includes("UPDATE public_enquiries"))
 throw Error("Historical closed enquiries must not be reclassified by a migration");
const actions=read("modules/crm/actions.ts");
for(const term of [
 'permissions.includes("crm.followups.manage")',
 "allowedProspectStatuses","academy_prospect_followups",
 "erp_audit_events","env.DB.batch","WHERE changes()=1"
])if(!actions.includes(term))throw Error("CRM followup missing "+term);
const legacy=read("app/api/staff/prospects/[id]/route.ts");
if(!legacy.includes('["NEW","CONTACTED","LEGACY_CLOSED"]') ||
   !legacy.includes("original CRM workspace"))
 throw new Error("Legacy /app must not overwrite an advanced source prospect status");
const assignment=read("modules/crm/assignment-actions.ts");
if(!assignment.includes('permissions.includes("crm.prospects.manage")')||
   !assignment.includes("erp_audit_events"))
 throw Error("CRM assignment needs permission and atomic audit");
for(const path of ["modules/crm/queries.ts","modules/crm/actions.ts","modules/crm/assignment-actions.ts"]){
 const code=read(path);
 if(code.includes("@/lib/supabase")||code.includes("@/modules/platform/rpc-client"))
 throw Error("CRM D1 adapter still includes Supabase: "+path);
}
console.log("Original CRM source UI, validation, transitions and D1 audit constraints verified.");
