import fs from "node:fs";
import crypto from "node:crypto";
const sourceBlob = "0b17fb382afb29a705cbec172a100b277017866c";
const page=fs.readFileSync("app/dashboard/students/page.tsx");
const actual=crypto.createHash("sha1").update("blob "+page.length+"\0").update(page).digest("hex");
if(actual!==sourceBlob)throw Error("Original Student Register page drifted from pinned source");
const queries=fs.readFileSync("modules/students/queries.ts","utf8");
for(const token of [
  'requirePermission("students.view")',
  'academy_students',
  'student_no',
  'created_at DESC,id DESC',
  'COUNT(*) AS n',
  'env.DB.prepare',
  'LIMIT ? OFFSET ?',
]) if(!queries.includes(token))throw Error("Student Register D1 source adapter missing "+token);
if(/supabase|rpc-client|public_enquiries/.test(queries))
 throw Error("Student Register must read admitted canonical students, not prospect intake or Supabase");
console.log("Original Student Register UI Git blob and permission-scoped D1 list contract verified.");
