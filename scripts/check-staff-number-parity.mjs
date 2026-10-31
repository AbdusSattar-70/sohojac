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
 "app/api/staff/directory/route.ts"]){
 if(!file(p).includes("staffNo")&&!file(p).includes("staff_no"))
  throw new Error("Staff ID not wired into "+p);
}
if(!file("app/api/staff/directory/route.ts").includes("getStaffAccess"))
 throw new Error("Staff register must require verified session");
console.log("Original SA-STF-000001 numbering and D1 staff identity wiring verified.");
