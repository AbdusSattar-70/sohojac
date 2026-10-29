import fs from "node:fs";
import crypto from "node:crypto";
function read(p){return fs.readFileSync(p,"utf8");}
function sha(p){const b=fs.readFileSync(p);return crypto.createHash("sha1").update("blob "+b.length+"\\0".replace("\\0","\0")).update(b).digest("hex");}
const pinned={
  "app/dashboard/admissions/application-form/page.tsx":"e74926fb534f2b1b3002ce7f9d961aa395cc9ddd",
  "modules/admissions/components/admission-paper.tsx":"0a9c35f30ce957f2c6c010434769cc04665be23b",
  "modules/admissions/components/document-styles.ts":"4af9cb09732793a620d6ed0ceaabb60ff686368f",
  "lib/academy/money-in-words.ts":"1f7de8e79ffa03f1f843fc015ee81afe8fdb7dbf",
};
for(const [p,expected] of Object.entries(pinned)){
 if(sha(p)!==expected)throw Error("Pinned original print document drift: "+p);
}
const page=read("app/dashboard/admissions/application-form/page.tsx");
if(!page.includes('requirePermission("admissions.create")'))
 throw Error("Blank application must require staff admissions permission");
const catalogue=read("modules/admissions/print-catalogue.ts");
for(const check of ['requirePermission("admissions.create")',
  "public_programme_offerings","academic_subjects","is_active=1","active=1","env.DB.prepare"])
 if(!catalogue.includes(check))throw Error("D1 catalogue source missing "+check);
if(/supabase|rpc-client/.test(catalogue))throw Error("Cannot use legacy DB");
const button=read("modules/admissions/components/print-button.tsx");
if(!button.includes("window.print()")||button.includes("useLanguage"))
 throw Error("Print handler must work and be English-only");
console.log("Pinned original A4 admission form UI and D1 academic option queries verified.");
