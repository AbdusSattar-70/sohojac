import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { globalSubjectDirectorySql, legacySubjectUsageSql } from "../lib/subject-directory-sql.ts";

function fresh() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for (const filename of readdirSync("migrations").filter((n) => /^\d{4}_.+\.sql$/.test(n)).sort()) {
    db.exec(readFileSync("migrations/" + filename, "utf8"));
  }
  db.exec(readFileSync("seeds/dev-reference.sql", "utf8"));
  return db;
}

test("global subjects have no grade-specific duplicate rows in the fresh four-migration development baseline", () => {
  const db = fresh();
  try {
    const global = db.prepare(globalSubjectDirectorySql).all();
    const legacy = db.prepare(legacySubjectUsageSql).all();
    assert(global.length >= 20, "seeded subject master missing");
    assert.equal(new Set(global.map((s) => s.id)).size, global.length);
    assert.equal(legacy.length, 0, "no legacy class-specific masters should be seeded");
    assert.equal(global.filter((s) => s.name === "Bangla").length, 1);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
  }
});

test("legacy subject linkage is audited without merging IDs or rewriting public data", () => {
  const db = fresh();
  try {
    db.prepare("INSERT INTO academy_subjects(id,code,name,class_grade,group_name) VALUES (?,?,?,?,?)")
      .run("legacy-bangla-8","BAN","Bangla",8,"GENERAL");
    db.prepare("INSERT INTO academy_subjects(id,code,name,class_grade,group_name) VALUES (?,?,?,?,?)")
      .run("legacy-bangla-10","BAN","Bangla",10,"GENERAL");
    db.prepare("INSERT INTO public_programme_offerings(id,code,name) VALUES(?,?,?)")
      .run("offering-a","B8-A","Class 8 preparation");
    db.prepare("INSERT INTO academy_offering_subjects(offering_id,subject_id) VALUES(?,?)")
      .run("offering-a","legacy-bangla-8");
    const globalBefore = db.prepare(globalSubjectDirectorySql).all();
    const subjectJsonBefore = db.prepare("SELECT subjects_json FROM public_programme_offerings WHERE id='offering-a'").get().subjects_json;
    const legacy = db.prepare(legacySubjectUsageSql).all();
    assert.equal(legacy.length, 2);
    assert.equal(legacy.find((s) => s.id === "legacy-bangla-8")?.linkedOfferings, 1);
    assert.equal(legacy.find((s) => s.id === "legacy-bangla-10")?.linkedOfferings, 0);
    assert.deepEqual(db.prepare(globalSubjectDirectorySql).all(),globalBefore);
    assert.equal(db.prepare("SELECT subjects_json FROM public_programme_offerings WHERE id='offering-a'").get().subjects_json, subjectJsonBefore);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
  } finally {
    db.close();
  }
});

test("UI reads canonical global subjects with named master-data permission and has no legacy grade writer", () => {
  const query = readFileSync("modules/academics/subjects/queries.ts","utf8");
  const page = readFileSync("app/dashboard/academics/subjects/page.tsx","utf8");
  const api = readFileSync("app/api/staff/subjects/route.ts","utf8");
  assert.match(query,/requirePermission\("system\.master_data\.manage"\)/);
  assert.match(query,/globalSubjectDirectorySql/);
  assert.match(query,/legacySubjectUsageSql/);
  assert.doesNotMatch(query,/env\.DB\.(?:batch|exec)/);
  assert.match(page,/getCanonicalSubjectDirectory/);
  assert.match(page,/settings\?section=subject/);
  const settingsPage = readFileSync("app/dashboard/academics/settings/page.tsx","utf8");
  const editor = readFileSync("modules/crm/manage/components/master-data-workspace.tsx","utf8");
  assert.match(settingsPage,/initialEntity=\{section === "subject"/);
  assert.match(editor,/initialEntity\?: MasterEntity/);

  assert.match(page,/not automatically merged/);
  assert.doesNotMatch(page,/SubjectsRegister/);
  assert.match(api,/Class-specific subject creation is retired/);
  assert.match(api,/\},410\)/);
  assert.doesNotMatch(api,/INSERT INTO academy_subjects/);
});
