import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { databaseTargets, requireDevelopmentDatabaseId, resolveDatabaseTarget, assertDatabaseRelease } from "../lib/database-target.ts";

const prod = databaseTargets.production.id;
const independent = "11111111-1111-4111-8111-111111111111";
test("production uses immutable sohojac D1 id", () => {
  assert.equal(resolveDatabaseTarget("production").id, prod);
  assert.equal(resolveDatabaseTarget("production").name, "sohojac");
});
test("dev requires a valid distinct D1 id", () => {
  assert.throws(() => requireDevelopmentDatabaseId(undefined));
  assert.throws(() => requireDevelopmentDatabaseId(prod));
  assert.throws(() => requireDevelopmentDatabaseId("invalid"));
  assert.equal(resolveDatabaseTarget("staging", independent).name, "sohojac_dev");
});
test("release branch and database binding mismatch fail closed", () => {
  assert.throws(() => assertDatabaseRelease("production", "refs/heads/dev", prod));
  assert.throws(() => assertDatabaseRelease("development", "refs/heads/master", independent));
  assert.throws(() => assertDatabaseRelease("development", "refs/heads/dev", prod));
  assert.equal(assertDatabaseRelease("production", "refs/heads/master", prod).name, "sohojac");
  assert.equal(assertDatabaseRelease("development", "refs/heads/dev", independent).name, "sohojac_dev");
});
test("fresh reference seed never prepopulates grade-duplicate subjects or people", () => {
  const sql = fs.readFileSync("seeds/dev-reference.sql", "utf8");
  assert.doesNotMatch(sql, /INSERT\s+(?:OR IGNORE\s+)?INTO\s+academy_subjects\s*\(/i);
  assert.doesNotMatch(sql, /INSERT\s+(?:OR IGNORE\s+)?INTO\s+(?:academy_students|finance_payments|academy_admissions)\b/i);
  assert.equal((sql.match(/INSERT OR IGNORE INTO academy_classes\(/g) || []).length, 12);
  assert.equal((sql.match(/INSERT OR IGNORE INTO academy_guardian_relationships\(/g) || []).length, 27);
});
test("historical production reset and DB retirement never run from new CI", () => {
  const workflow = fs.readFileSync(".github/workflows/erp-ci.yml", "utf8");
  assert.doesNotMatch(workflow, /reset-foundation\.mjs|retire-legacy-dev-database\.mjs/);
  assert.doesNotMatch(workflow, /sharedD1|sohojac-shared-d1-release/);
});
