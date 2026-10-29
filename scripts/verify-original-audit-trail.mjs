import fs from "node:fs";
import crypto from "node:crypto";
function blob(path){
 const b=fs.readFileSync(path);
 return crypto.createHash("sha1").update("blob "+b.length+"\0").update(b).digest("hex");
}
if(blob("app/dashboard/governance/audit/page.tsx")!=="dd0a5ba8671790e6ab618e0a034b099e41399136")
 throw Error("Original source audit route changed");
const view=fs.readFileSync("modules/governance/audit-view.tsx","utf8");
for(const t of ["Audit Trail","No matching events.","Audit pages","Person / role / ID","English-only"])
 if(!view.includes(t))throw Error("Original Audit Trail view missing "+t);
if(view.includes("useLanguage()"))
 throw Error("ERP Audit Trail must stay English-only");
const query=fs.readFileSync("modules/governance/queries.ts","utf8");
for(const t of [
 'requirePermission("audit.view")',"erp_audit_events","a.actor_id AS actor_profile_id",
 "s.staff_no AS actor_staff_no","m.role AS actor_role_code",
 "date(a.occurred_at,'+6 hours')","COUNT(*) AS n",
 "LIMIT ? OFFSET ?","admissions:null","refunds:null"
])if(!query.includes(t))throw Error("D1 governance adapter missing "+t);
if(query.includes("supabase")||query.includes("rpc-client"))
 throw Error("Audit Trail cannot depend on Supabase RPC");
console.log("Original Audit Trail UI layout and protected D1 audit query contract verified.");
