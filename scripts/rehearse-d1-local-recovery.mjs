/**
 * C6 local recovery rehearsal. Uses the same SQLite DDL as D1, but never calls
 * Cloudflare or changes any remote database. This is NOT a D1 Time Travel restore.
 */
import {DatabaseSync,backup} from "node:sqlite";
import {readFileSync,readdirSync,mkdtempSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import assert from "node:assert/strict";

const dir=mkdtempSync(join(tmpdir(),"sohojac-recovery-"));
const source=join(dir,"source.sqlite"),snapshot=join(dir,"snapshot.sqlite");
let original,restored;
try{
 original=new DatabaseSync(source);
 original.exec("PRAGMA foreign_keys=ON");
 const names=readdirSync("migrations").filter(x=>/^\d{4}_.+\.sql$/.test(x)).sort();
 if(!names.length)throw Error("No migrations found");
 for(const migration of names)original.exec(readFileSync(join("migrations",migration),"utf8"));
 // Synthetic records with real foreign keys, never live student/guardian data.
 original.prepare('INSERT INTO "user"(id,name,email,createdAt,updatedAt) VALUES(?,?,?,?,?)')
  .run("staff-rehearsal","Synthetic staff","rehearsal@example.invalid",1,1);
 original.prepare("INSERT INTO academy_students(id,student_no,full_name,guardian_name,guardian_mobile) VALUES(?,?,?,?,?)")
  .run("student-rehearsal","SA-STD-REHEARSAL","Synthetic student","Synthetic guardian","01700000000");
 original.prepare("INSERT INTO guardian_message_outbox(id,request_id,student_id,template_key,consent_attested,created_by) VALUES(?,?,?,?,1,?)")
  .run("held-rehearsal","11111111-1111-1111-1111-111111111111","student-rehearsal","GENERAL_REMINDER","staff-rehearsal");
 assert.equal(original.prepare("PRAGMA integrity_check").get().integrity_check,"ok");
 assert.deepEqual(original.prepare("PRAGMA foreign_key_check").all(),[]);
 const snapshotBytes=await backup(original,snapshot);
 assert(snapshotBytes>0,"Snapshot must contain pages");
 // Simulate accidental corruption/deletion AFTER backup, then independently reopen snapshot.
 original.prepare("UPDATE academy_students SET full_name=? WHERE id=?").run("WRONG", "student-rehearsal");
 original.prepare("DELETE FROM guardian_message_outbox WHERE id=?").run("held-rehearsal");
 assert.equal(original.prepare("SELECT COUNT(*) n FROM guardian_message_outbox").get().n,0);
 original.close();original=undefined;
 restored=new DatabaseSync(snapshot);
 restored.exec("PRAGMA foreign_keys=ON");
 assert.equal(restored.prepare("PRAGMA integrity_check").get().integrity_check,"ok");
 assert.deepEqual(restored.prepare("PRAGMA foreign_key_check").all(),[]);
 assert.equal(restored.prepare("SELECT full_name FROM academy_students WHERE id=?")
  .get("student-rehearsal").full_name,"Synthetic student");
 assert.equal(restored.prepare("SELECT status FROM guardian_message_outbox WHERE id=?")
  .get("held-rehearsal").status,"HELD");
 assert.equal(restored.prepare("SELECT COUNT(*) n FROM sqlite_schema WHERE name='guardian_message_outbox'").get().n,1);
 console.log("PASS local SQLite recovery rehearsal: snapshot survived simulated edits and deletion;");
 console.log("foreign keys, integrity and held outbox were preserved. No D1 Time Travel restore performed.");
}finally{
 try{original?.close();}catch{}
 try{restored?.close();}catch{}
 rmSync(dir,{recursive:true,force:true});
}
