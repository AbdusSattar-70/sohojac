import { databaseTargets, requireDevelopmentDatabaseId } from "../lib/database-target.ts";

/** Read-only post-deploy proof of the exact dev D1 binding and clean baseline.
 * Never queries or alters the production DB. After the one-time reset only,
 * also verifies no staff, students, payments or marketing sample records.
 */
const { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token }=process.env;
if(process.env.GITHUB_REF!==databaseTargets.development.branch||!account||!token)
 throw Error("Canonical verification can run only in authenticated dev deployments.");
const id=requireDevelopmentDatabaseId(process.env.SOHOJAC_DEV_D1_ID);
if(process.env.SOHOJAC_D1_ID!==id)throw Error("Dev release D1 IDs are inconsistent.");
const base="https://api.cloudflare.com/client/v4/accounts/"+encodeURIComponent(account)+"/d1/database/"+encodeURIComponent(id);
async function call(path,body){
 const r=await fetch(base+path,{
  method:body?"POST":"GET",
  headers:{Authorization:"Bearer "+token,...(body?{"Content-Type":"application/json"}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
 });
 const j=await r.json().catch(()=>null);
 if(!r.ok||j?.success!==true||Array.isArray(j.result)&&j.result.some(x=>x.success===false))
  throw Error("Cannot verify canonical dev database: HTTP "+r.status);
 return j.result;
}
const metadata=await call("");
if(metadata?.name!==databaseTargets.development.name||metadata?.uuid!==id)
 throw Error("Refusing to verify unexpected D1 identity.");
const query=async sql=>(await call("/query",{sql,params:[]}))[0].results;
const recorded=(await query("SELECT name FROM d1_migrations ORDER BY name")).map(x=>x.name);
const expected=["0001_schema_tables.sql","0002_schema_indexes.sql","0003_domain_guards.sql","0004_finance_reference.sql","0005_master_versions.sql"];
if(JSON.stringify(recorded)!==JSON.stringify(expected))
 throw Error("Development D1 does not have the five development migrations.");
const row=(await query(
 "SELECT (SELECT COUNT(*) FROM academy_classes) classes,"+
 "(SELECT COUNT(*) FROM academy_guardian_relationships) relationships,"+
 "(SELECT COUNT(*) FROM academic_subjects) subjects,"+
 "(SELECT COUNT(*) FROM sqlite_schema WHERE type='table' AND name='academy_subjects') old_subject_tables,"+
 "(SELECT COUNT(*) FROM sqlite_schema WHERE name LIKE '%_pre_0029') legacy_snapshots,"+
 "(SELECT status FROM system_maintenance_operations WHERE id='canonical-reference-seed-v1') reference_status"
))[0];
if(row.classes!==12||row.relationships!==27||row.subjects<20||
   row.legacy_snapshots!==0||row.reference_status!=="COMPLETE")
 throw Error("Canonical dev references/schema differ from the expected clean design.");
if(process.env.RESET_DEV_BASELINE_WAS_RECREATED==="1"){
 const fresh=(await query(
  'SELECT (SELECT COUNT(*) FROM "user") staff,'+
  "(SELECT COUNT(*) FROM staff_memberships) memberships,"+
  "(SELECT COUNT(*) FROM public_programme_offerings) offerings,"+
  "(SELECT COUNT(*) FROM academy_students) students,"+
  "(SELECT COUNT(*) FROM academy_admissions) admissions,"+
  "(SELECT COUNT(*) FROM finance_invoices) invoices,"+
  "(SELECT COUNT(*) FROM finance_payments) payments,"+
  "(SELECT COUNT(*) FROM finance_operating_expenses) expenses"
 ))[0];
 if(Object.values(fresh).some(n=>n!==0))
  throw Error("New development D1 is not empty of business identities and records.");
 console.log("Fresh dev reset: no staff, offerings, admissions, students, invoices, receipts or expenses.");
}
if(row.old_subject_tables!==0)throw Error("Legacy subject definition table must not exist.");
console.log("Independent dev D1 verified: five migrations and one global subject master, global subjects, 12 classes and 27 guardian relationships.");
