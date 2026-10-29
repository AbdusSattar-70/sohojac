import fs from "node:fs";
import crypto from "node:crypto";
const pinned=JSON.parse(fs.readFileSync("docs/source-first-erp-manifest.json","utf8"));
const sources=[...pinned.dashboardPages,...pinned.modules];
const filenames=[
"app/dashboard/help/page.tsx",
"app/dashboard/help/academics/page.tsx",
"app/dashboard/help/finance/page.tsx",
"modules/help/admission-steps.ts",
"modules/help/daily-steps.ts",
"modules/help/finance-guide.bn.json",
"modules/help/setup-steps.ts",
"modules/help/workflow-guide.tsx"];
for(const path of filenames){
 const entry=sources.find(x=>x.path===path);
 if(!entry)throw new Error("Original help file missing from pinned source: "+path);
 const buffer=fs.readFileSync(path);
 const sha=crypto.createHash("sha1").update("blob "+buffer.length+"\0").update(buffer).digest("hex");
 if(sha!==entry.blob)throw new Error("Original help file modified: "+path);
}
const registry=fs.readFileSync("modules/platform/navigation/erp-route-registry.ts","utf8");
const navigation=fs.readFileSync("modules/platform/navigation/erp-navigation.ts","utf8");
if(!registry.includes('"/dashboard/help"')||!navigation.includes("isAvailableErpRoute"))throw new Error("Original help navigation unavailable");
console.log("Original 3 help routes and 5 help module files are byte-for-byte preserved.");
