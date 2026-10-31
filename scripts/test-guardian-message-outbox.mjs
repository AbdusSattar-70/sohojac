import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";

test("guardian messages are consent-attested, held, retry-safe and never sent",()=>{
 const db=new DatabaseSync(":memory:");
 try{
  db.exec("PRAGMA foreign_keys=ON");
  for(const file of readdirSync("migrations").filter(n=>/^\\d{4}_.*\\.sql$/.test(n)).sort())
   db.exec(readFileSync("migrations/"+file,"utf8"));
  const schema=db.prepare("SELECT sql FROM sqlite_schema WHERE name='guardian_message_outbox'").get().sql;
  assert.match(schema,/CHECK\\(consent_attested=1\\)/);
  assert.match(schema,/status IN \\('HELD','CANCELLED'\\)/);
  assert.doesNotMatch(schema,/SENT|DELIVERED|DISPATCHING/);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
  assert.equal(db.prepare("SELECT count(*) n FROM guardian_message_outbox").get().n,0);
  const columns=db.prepare("PRAGMA table_info(guardian_message_outbox)").all().map(r=>r.name);
  assert(!columns.some(c=>/mobile|phone|recipient|body|message_text/i.test(c)));
  assert(columns.includes("request_id"));
  assert(columns.includes("created_by"));
  assert(columns.includes("consent_attested"));
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_schema WHERE type='index' AND tbl_name='guardian_message_outbox'").get().n>=2,true);
 }finally{db.close();}
});
test("staff message route cannot enable delivery or caller-selected phone",()=>{
 const route=readFileSync("app/api/staff/messages/route.ts","utf8");
 assert.match(route,/getCommandAccess/);
 assert.match(route,/sameOrigin/);
 assert.match(route,/audit.view/);
 assert.match(route,/consentAttested/);
 assert.match(route,/guardian_mobile FROM academy_students/);
 assert.match(route,/INSERT OR IGNORE INTO guardian_message_outbox/);
 assert.match(route,/delivered:false/);
 assert.doesNotMatch(route,/fetch\\s*\\(|\.sendSMS\\s*\\(|\.sendSms\\s*\\(/);
});
