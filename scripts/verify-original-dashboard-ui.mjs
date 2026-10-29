import fs from "node:fs";
import crypto from "node:crypto";
const file=fs.readFileSync("app/dashboard/page.tsx");
const hash=crypto.createHash("sha1").update("blob "+file.length+"\0").update(file).digest("hex");
if(hash!=="29775f515071f4d4d09911937787a857d4d27f38")throw Error("Original dashboard UI has been replaced or redesigned");
const query=fs.readFileSync("modules/dashboard/queries.ts","utf8");
if(query.includes("@/lib/supabase"))throw Error("Dashboard D1 adapter must not import Supabase");
for(const required of ["getDashboardOverview","activeProspects","activeStudents","activeStaff","pendingApprovals","dueFollowups","recentProspects"]){
 if(!query.includes(required))throw Error("Missing original dashboard query contract: "+required);
}
console.log("Exact original dashboard UI and Cloudflare D1 query contract verified.");
