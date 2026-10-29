import fs from "node:fs";
import crypto from "node:crypto";
const schema=fs.readFileSync("modules/offerings/schema.ts");
const blob=crypto.createHash("sha1").update("blob "+schema.length+"\0").update(schema).digest("hex");
if(blob!=="da68ef71bc0b0a9574710b824c591ba2bcc04375")throw new Error("Source offerings validation/schema changed unexpectedly");
const sql=fs.readFileSync("migrations/0025_offering_relationships.sql","utf8");
for(const field of ["branch_id","academic_year_id","class_id","program_id","group_id","operation_kind"]){
 if(!sql.includes("ADD COLUMN "+field+" "))throw new Error("Missing source relationship "+field);
}
if(/DELETE\s+FROM|DROP\s+TABLE|UPDATE\s+public_programme_offerings/i.test(sql))
 throw new Error("Offerings relationship migration mutates existing catalogue records");
const adapter=fs.readFileSync("modules/offerings/d1-contract.ts","utf8");
if(!adapter.includes('requirePermission("academics.view")')||
   !adapter.includes("UNLINKED")||!adapter.includes("public_programme_offerings"))
 throw new Error("D1 offerings read contract must be authenticated and preserve legacy data");
console.log("Original offerings input contract and additive D1 relationship mapping verified.");
