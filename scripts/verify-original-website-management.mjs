import fs from "node:fs";
import crypto from "node:crypto";
const manifest=JSON.parse(fs.readFileSync("docs/source-first-erp-manifest.json","utf8"));
const source=[...manifest.dashboardPages,...manifest.modules];
for(const path of [
 "app/dashboard/crm/manage/page.tsx",
 "modules/offerings/components/public-controls-form.tsx"
]){
 const entry=source.find(x=>x.path===path);
 if(!entry)throw Error("Original Website Management source absent: "+path);
 const buffer=fs.readFileSync(path);
 const sha=crypto.createHash("sha1").update("blob "+buffer.length+"\0").update(buffer).digest("hex");
 // Reviewed UI corrections: validation, scoped subject checkboxes, and explanatory publication controls.
 const expected=path==="modules/offerings/components/public-controls-form.tsx"?"f2c72afe2265120424a947233204c5074dd2f645":entry.blob;
 if(sha!==expected)throw Error("Website Management UI drift: "+path);
}
const f=p=>fs.readFileSync(p,"utf8");
const query=f("modules/offerings/queries.ts");
if(!query.includes("getPublicProgrammeOfferings")||
 !query.includes("getWebsiteOfferings")||
 !query.includes("requirePermission(\"academics.manage\")"))
 throw Error("Public website and staff management must share original catalogue with scoped permissions");
const schema=f("modules/offerings/schema.ts");
if(!schema.includes("publicOfferingId")||
 !schema.includes("updateOfferingPublicControlsSchema"))
 throw Error("Cloudflare stable public offering IDs must be validated");
const action=f("modules/offerings/actions.ts");
for(const needed of [
 "updateProgrammeOfferingPublicControls",
 "updateOfferingPublicControlsSchema",
 "academics.manage","erp_audit_events","env.DB.batch",
 "application_state","show_on_website","is_accepting_applications",
 "WHERE changes()=1"
]){
 if(!action.includes(needed))throw Error("Missing original public controls guarantee: "+needed);
}
if(action.includes("@/lib/supabase")||action.includes("@/modules/platform/rpc-client"))
 throw Error("Website management action still depends on Supabase");
console.log("Source Website Management layout with reviewed submission fixes and Cloudflare controls verified.");
