import fs from "node:fs";
import crypto from "node:crypto";
const file=fs.readFileSync("app/dashboard/page.tsx");
const hash=crypto.createHash("sha1").update("blob "+file.length+"\0").update(file).digest("hex");
if(hash!=="8ef682cb8c9770a62bcdc57bf7967b9da0d537d9")throw Error("Original dashboard UI has been replaced or redesigned");
const query=fs.readFileSync("modules/dashboard/queries.ts","utf8");
if(query.includes("@/lib/supabase"))throw Error("Dashboard D1 adapter must not import Supabase");
for(const required of ["getDashboardOverview","activeProspects","activeStudents","activeStaff","pendingApprovals","dueFollowups","recentProspects"]){
 if(!query.includes(required))throw Error("Missing original dashboard query contract: "+required);
}
console.log("Original dashboard UI with consolidated Academic Setup link and Cloudflare D1 query contract verified.");
