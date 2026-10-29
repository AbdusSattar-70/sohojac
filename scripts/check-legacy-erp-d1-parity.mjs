import { readFileSync } from "node:fs";
const file = path => readFileSync(path,"utf8");
const original = file("modules/platform/navigation/erp-route-registry.ts");
const permissions = [...original.matchAll(/permission: "([^"]+)"/g)].map(row => row[1]);
if (new Set(permissions).size < 18) throw new Error("Original fine-grained permissions missing");
const auth = file("modules/platform/auth/erp-context.ts");
if (!auth.includes("getStaffAccessForPage") || !auth.includes("erp_permission_grants"))
  throw new Error("ERP context must require verified staff session and D1 grants");
if (!auth.includes("return null;")) throw new Error("ERP context must fail closed");
const schema = file("migrations/0021_erp_permission_grants.sql");
if (!schema.includes("PRIMARY KEY(user_id,permission)") || !schema.includes("REFERENCES staff_memberships"))
  throw new Error("D1 grants must be scoped to a verified staff member");
const year = file("migrations/0022_multiple_active_academic_years.sql");
if (!year.includes("DROP INDEX IF EXISTS idx_one_active_academic_year"))
  throw new Error("D1 still restricts overlapping active academic years");
if (/DELETE FROM|DROP TABLE/i.test(year)) throw new Error("Academic year migration destroys records");
if (/Only one year may be active/.test(file("components/staff/academic-years-register.tsx")))
  throw new Error("Old academic-year restriction still shown in UI");
if (/Only one academic year may be active/.test(file("app/api/staff/academic-years/[id]/route.ts")))
  throw new Error("Incorrect academic-year conflict remains");
const migrated=["modules/crm/manage/schema.ts","modules/crm/manage/actions.ts",
 "modules/crm/manage/queries.ts","modules/crm/manage/components/master-data-workspace.tsx",
 "app/dashboard/academics/settings/page.tsx"];
for(const p of migrated){
 if(!file(p))throw new Error("Missing original-master-data migration contract: "+p);
}
for(const p of ["modules/crm/manage/actions.ts","modules/crm/manage/queries.ts"]){
 if(/supabase/i.test(file(p)))throw new Error("Migrated master-data backend still depends on Supabase: "+p);
}
const masterWrite = file("modules/crm/manage/actions.ts");
if(masterWrite.includes('flag?"ACTIVE":"CLOSED"'))
 throw new Error("Inactive source academic years must not be finalized CLOSED");
if(!masterWrite.includes('flag?"ACTIVE":"DRAFT"'))
 throw new Error("Source academic-year form needs reversible ACTIVE/DRAFT semantics");
if(!masterWrite.includes('status==="CLOSED"'))
 throw new Error("Previously finalized CLOSED academic years must remain protected");
console.log("Original navigation, D1 grants and overlapping academic years contract verified.");
