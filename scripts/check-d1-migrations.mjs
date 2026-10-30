/**
 * Canonical operator-first D1 migration verification.
 *
 * Root migrations/ contains ONLY four clean, current-schema files.
 * migrations/history preserves the 36 immutable names already recorded by
 * production D1. The four must be byte-identical to a regenerated final
 * schema snapshot from those historic files; no invented data or DDL drift.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = "migrations", history = "migrations/history";
const canonical = readdirSync(root).filter(n=>/^\d{4}_[a-z0-9_-]+\.sql$/.test(n)).sort();
assert.deepEqual(canonical,[
  "0001_schema_tables.sql","0002_schema_indexes.sql",
  "0003_domain_guards.sql","0004_finance_reference.sql",
],"Unexpected canonical D1 migration files; review database drift before deployment.");
const legacy = readdirSync(history).filter(n=>/^\d{4}_[a-z0-9_-]+\.sql$/.test(n)).sort();
assert.equal(legacy.length,36,"Production migration archive must contain the 36 known files.");
assert.equal(legacy[0],"0001_public_website.sql");
assert.equal(legacy.at(-1),"0037_operator_expense_commands.sql");
const studentLifecycle = createHash("sha256").update(readFileSync(join(history,"0029_student_lifecycle.sql"))).digest("hex");
assert.equal(studentLifecycle,"9f7796f6ca25a07e20d1d8f44fc9f842fb8a55756fd78f7593d9bc4f384d6436",
  "Reviewed production student preservation migration changed.");
const temp = mkdtempSync(join(tmpdir(),"sohojac-canonical-"));
try{
  execFileSync(process.execPath,["scripts/generate-canonical-migrations.mjs",history,temp],{stdio:"pipe",maxBuffer:8*1024*1024});
  for(const name of canonical)assert.equal(readFileSync(join(root,name),"utf8"),readFileSync(join(temp,name),"utf8"),
    "Canonical schema differs from verified final historical schema: "+name);
}finally{rmSync(temp,{recursive:true,force:true});}
console.log("Checked four canonical dev migration files against 36 immutable production-history files. No schema drift.");
