import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readdirSync,readFileSync,existsSync} from "node:fs";
import {test} from "node:test";

const migrations=readdirSync("migrations").filter(x=>/^\d{4}_.+\.sql$/.test(x)).sort();
function database(){
 const db=new DatabaseSync(":memory:");
 db.exec("PRAGMA foreign_keys=ON");
 for(const file of migrations)
  db.exec(readFileSync("migrations/"+file,"utf8"));
 return db;
}
const physicsId="61f850dd-0509-5a25-92de-9c0847785dea";

test("four clean migrations produce one reusable Subject entity with no old master",()=>{
 const db=database();
 try {
  const names=new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map(x=>x.name));
  assert(names.has("academic_subjects"));
  assert(names.has("academy_offering_subjects"),"one many-to-many relationship, not another master");
  assert(!names.has("academy_subjects"),"old per-class subject master must be gone");
  const cols=db.prepare("PRAGMA table_info(academic_subjects)").all().map(x=>x.name);
  assert.deepEqual(cols,["id","code","title","active"]);
  assert(db.prepare("PRAGMA foreign_key_list(academy_offering_subjects)").all()
    .some(x=>x.table==="academic_subjects" && x.from==="subject_id"));
  db.exec(readFileSync("seeds/dev-reference.sql","utf8"));
  const found=db.prepare("SELECT COUNT(*) n FROM academic_subjects WHERE title='Physics'").get().n;
  assert.equal(found,1);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
 }finally{db.close();}
});

test("the same global Subject works across two classes and updates public cards",()=>{
 const db=database();
 try{
  db.exec(readFileSync("seeds/dev-reference.sql","utf8"));
  db.prepare("INSERT INTO public_programme_offerings(id,code,name,class_name) VALUES(?,?,?,?)")
    .run("class8","C8","Class 8 programme","Class 8");
  db.prepare("INSERT INTO public_programme_offerings(id,code,name,class_name) VALUES(?,?,?,?)")
    .run("class10","C10","Class 10 programme","Class 10");
  for(const id of ["class8","class10"])
    db.prepare("INSERT INTO academy_offering_subjects(offering_id,subject_id) VALUES(?,?)")
      .run(id,physicsId);
  const cards=()=>db.prepare("SELECT subjects_json FROM public_programme_offerings ORDER BY id").all()
    .map(x=>JSON.parse(x.subjects_json));
  assert.deepEqual(cards(),Array(2).fill([{id:physicsId,code:"SUB07",name:"Physics"}]));
  db.prepare("UPDATE academic_subjects SET title='Physics Advanced' WHERE id=?").run(physicsId);
  assert(cards().every(x=>x[0].name==="Physics Advanced"));
  db.prepare("UPDATE academic_subjects SET active=0 WHERE id=?").run(physicsId);
  assert.deepEqual(cards(),[[],[]],"inactive subject omitted from cards, relationship preserved");
  db.prepare("UPDATE academic_subjects SET active=1 WHERE id=?").run(physicsId);
  assert(cards().every(x=>x[0].name==="Physics Advanced"));
  assert.throws(()=>db.prepare("INSERT INTO academy_offering_subjects(offering_id,subject_id) VALUES('class8','missing')").run());
  assert.throws(()=>db.prepare("INSERT INTO academy_offering_subjects(offering_id,subject_id) VALUES('class8',?)").run(physicsId));
  db.prepare("DELETE FROM academy_offering_subjects WHERE offering_id='class8'").run();
  assert.equal(cards().filter(x=>x.length===0).length,1);
  assert.equal(cards().filter(x=>x.length===1 && x[0].id===physicsId).length,1);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
 }finally{db.close();}
});

test("only the reusable master editor and global pickers remain",()=>{
 const page=readFileSync("app/dashboard/academics/subjects/page.tsx","utf8");
 const advanced=readFileSync("modules/offerings/components/public-controls-form.tsx","utf8");
 const guided=readFileSync("modules/offerings/components/operator-launch-forms.tsx","utf8");
 const query=readFileSync("modules/offerings/queries.ts","utf8");
 const commands=readFileSync("modules/offerings/actions.ts","utf8");
 assert.match(page,/settings\?section=subject/);
 assert.match(advanced,/data-global-subject-picker/);
 assert.match(guided,/data-launch-subjects/);
 assert.match(query,/FROM academic_subjects/);
 assert.match(commands,/LEFT JOIN academic_subjects/);
 assert(!existsSync("lib/erp-subjects.ts"));
 assert(!existsSync("app/api/staff/subjects/route.ts"));
 assert(!existsSync("lib/subject-directory-sql.ts"));
 assert(!existsSync("modules/academics/subjects/queries.ts"));
});
