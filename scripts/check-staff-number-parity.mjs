import fs from "node:fs";
const file=p=>fs.readFileSync(p,"utf8");
const sql=file("migrations/0001_schema_tables.sql")+"\n"+file("migrations/0003_domain_guards.sql");
for(const term of [
 "staff_seq INTEGER PRIMARY KEY AUTOINCREMENT",
 "SA-STF-", "printf('%06d',staff_seq)", "STORED UNIQUE",
 "AFTER INSERT ON staff_memberships", "linked_user_id TEXT UNIQUE"
]){
 if(!sql.includes(term))throw new Error("Missing original permanent staff ID guarantee: "+term);
}
if(/(?:MAX|COUNT)\s*\(\s*staff_seq\s*\)\s*\+\s*1/i.test(sql))
 throw new Error("Staff numbers must not be allocated from MAX+1");
for(const p of ["lib/staff-access.ts","modules/platform/auth/erp-context.ts",
 "components/erp/erp-account.tsx","app/dashboard/account/page.tsx",
 "modules/staff/queries.ts"]){
 if(!file(p).includes("staffNo")&&!file(p).includes("staff_no"))
  throw new Error("Staff ID not wired into "+p);
}
if(fs.existsSync("app/api/staff/directory/route.ts") ||
   fs.existsSync("components/staff/staff-directory.tsx"))
 throw new Error("Obsolete manual staff creation route or client register survived cleanup");
if(!file("app/api/staff/accept-invitation/route.ts").includes("INSERT INTO staff_memberships"))
 throw new Error("Staff identity must originate from verified invitation activation");
console.log("Original SA-STF-000001 numbering and invitation-only staff identity wiring verified.");
