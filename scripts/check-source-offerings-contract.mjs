import fs from "node:fs";
import crypto from "node:crypto";
const live=fs.readFileSync("modules/offerings/schema.ts","utf8");
const adaptation="// Cloudflare keeps legacy public offering slugs as stable IDs; other relationships remain UUIDs.\nconst publicOfferingId=z.union([id,z.string().trim().min(1).max(100).regex(/^[a-z0-9-]+$/)]);\n";
if(!live.includes(adaptation)||!live.includes("offeringId: publicOfferingId"))
 throw new Error("Legacy public D1 offering IDs must remain accepted in UI schema");
// Remove only the reviewed infrastructure metadata additions before proving
// every original business validation byte against the pinned source blob.
let normalized=live.replace(adaptation,"").replaceAll("offeringId: publicOfferingId","offeringId: id");
for(const marker of [
 "  requestId: id,\n  expectedVersion: z.number().int().min(1).optional(),\n  reason: z\n",
 "    offeringId: id,\n    requestId: id,\n    expectedVersion: z.number().int().min(1),\n",
 "  subjectIds: z.array(publicOfferingId).max(30),\n  requestId: id.optional(),\n  expectedVersion: z.number().int().min(1).optional(),\n"
]) if(!normalized.includes(marker))throw Error("Missing reviewed offering concurrency/legacy ID adaptation");
normalized=normalized
 .replace("  requestId: id,\n  expectedVersion: z.number().int().min(1).optional(),\n  reason: z\n","  reason: z\n")
 .replace("export const offeringFormSchema = createOfferingSchema.extend({\n  offeringId: id.optional(),\n  requestId: id,\n});","export const offeringFormSchema = createOfferingSchema.extend({\n  offeringId: id.optional(),\n  requestId: id.optional(),\n});")
 .replace("  requestId: id,\n  expectedVersion: z.number().int().min(1),\n});","  requestId: id,\n});")
 .replace("    offeringId: id,\n    requestId: id,\n    expectedVersion: z.number().int().min(1),\n","    offeringId: id,\n")
 .replace("  subjectIds: z.array(publicOfferingId).max(30),\n  requestId: id.optional(),\n  expectedVersion: z.number().int().min(1).optional(),\n","  subjectIds: z.array(z.string().uuid()).max(30),\n");
const schema=Buffer.from(normalized);
const blob=crypto.createHash("sha1").update("blob "+schema.length+"\\0".replace("\\0","\0")).update(schema).digest("hex");
if(blob!=="da68ef71bc0b0a9574710b824c591ba2bcc04375")throw new Error("Source offerings validation/schema changed unexpectedly");
for(const [path,expected] of [
 ["app/dashboard/academics/offerings/page.tsx","b247b3aa419f01061ff7deae3e81903d079cd48a"],
 ["app/dashboard/finance/fee-plans/page.tsx","3ed51cff844afef9794fdfccb31b52f0a40d6532"],
 ["modules/offerings/components/discount-policy-form.tsx","0fa438767a0e02a82fd6ba0bd28a05f87699d64e"]
]){
 const source=fs.readFileSync(path);
 const actual=crypto.createHash("sha1").update("blob "+source.length+"\0").update(source).digest("hex");
 if(actual!==expected)throw Error("Original source offering screen drifted: "+path);
}
const sql=fs.readFileSync("migrations/history/0025_offering_relationships.sql","utf8");
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
