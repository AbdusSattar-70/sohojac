#!/usr/bin/env bash
# C10: authenticated held-only guardian messaging smoke against DISPOSABLE local D1.
# Called by ci-authenticated-smoke.sh BEFORE membership revocation. No network
# request targets an SMS provider or a remote Cloudflare database.
set -euo pipefail
DB=d6f3e4e9-2190-43bf-bc90-969687f6db78
BASE=http://localhost:4173
COOKIE=/tmp/staff-ci-cookies
TEACHER=/tmp/teacher-ci-cookies
HEADERS=(-H "Origin: $BASE" -H "Content-Type: application/json")
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state --sql "
 INSERT INTO academy_students(id,student_no,full_name,guardian_name,guardian_mobile)
 VALUES ('ci-msg-student-a','SA-STD-CI-MSG-A','Synthetic Learner A','Synthetic Guardian','01766666666'),
 ('ci-msg-student-b','SA-STD-CI-MSG-B','Synthetic Learner B','Synthetic Guardian','01766666666'),
 ('ci-msg-student-c','SA-STD-CI-MSG-C','Synthetic Learner C','Synthetic Guardian','01777777777');
" >/tmp/ci-msg-seed.json
reqA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01'
reqB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02'
reqC='cccccccc-cccc-4ccc-8ccc-cccccccccc03'
post(){
 local name="$1" url="$2" body="$3"
 curl --silent --show-error -o "/tmp/ci-msg-${name}.json" -w '%{http_code}' \
   -b "$COOKIE" -X POST "$BASE$url" "${HEADERS[@]}" --data "$body"
}
invalid=$(post missing-consent /api/staff/messages \
  "{\"studentId\":\"ci-msg-student-a\",\"templateKey\":\"GENERAL_REMINDER\",\"requestId\":\"$reqA\",\"consentAttested\":false}")
test "$invalid" = 400
heldA=$(post held-a /api/staff/messages \
  "{\"studentId\":\"ci-msg-student-a\",\"templateKey\":\"GENERAL_REMINDER\",\"requestId\":\"$reqA\",\"consentAttested\":true}")
heldB=$(post held-b /api/staff/messages \
  "{\"studentId\":\"ci-msg-student-b\",\"templateKey\":\"ADMISSION_FOLLOWUP\",\"requestId\":\"$reqB\",\"consentAttested\":true}")
test "$heldA" = 201
test "$heldB" = 201
node --input-type=module -e '
import {readFileSync} from "node:fs";
for(const name of ["held-a","held-b"]){
 const x=JSON.parse(readFileSync("/tmp/ci-msg-"+name+".json","utf8"));
 if(x.status!=="HELD"||x.delivered!==false||x.replayed!==false)process.exit(1);
}'
optout=$(post optout /api/staff/messages/opt-out \
  '{"studentId":"ci-msg-student-a","reason":"Guardian explicitly declined all SMS"}')
test "$optout" = 200
ownerList=$(curl --silent --show-error -o /tmp/ci-msg-outbox.json -w '%{http_code}' \
  -b "$COOKIE" "$BASE/api/staff/messages")
test "$ownerList" = 200
node --input-type=module -e '
import {readFileSync} from "node:fs";
const x=JSON.parse(readFileSync("/tmp/ci-msg-outbox.json","utf8"));
if(x.deliveryEnabled!==false)throw Error("Provider delivery unexpectedly enabled");
for(const id of ["ci-msg-student-a","ci-msg-student-b"]){
 const row=x.items.find(r=>r.student_id===id);
 if(row?.status!=="CANCELLED")throw Error("Shared guardian opt-out did not cancel "+id);
}
if(JSON.stringify(x).includes("01766666666"))throw Error("Guardian mobile exposed in outbox API");
'
blocked=$(post blocked-sibling /api/staff/messages \
  '{"studentId":"ci-msg-student-b","templateKey":"GENERAL_REMINDER","requestId":"dddddddd-dddd-4ddd-8ddd-dddddddddd04","consentAttested":true}')
test "$blocked" = 409
retried=$(post retry /api/staff/messages \
  "{\"studentId\":\"ci-msg-student-a\",\"templateKey\":\"GENERAL_REMINDER\",\"requestId\":\"$reqA\",\"consentAttested\":true}")
test "$retried" = 200
node -e 'const x=require("/tmp/ci-msg-retry.json");if(x.replayed!==true||x.status!=="CANCELLED"||x.delivered!==false)process.exit(1)'
heldC=$(post held-c /api/staff/messages \
  "{\"studentId\":\"ci-msg-student-c\",\"templateKey\":\"GENERAL_REMINDER\",\"requestId\":\"$reqC\",\"consentAttested\":true}")
test "$heldC" = 201
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state \
  --sql "UPDATE academy_students SET guardian_mobile='01788888888' WHERE id='ci-msg-student-c'" >/tmp/ci-msg-contact-change.json
curl --fail --silent --show-error -b "$COOKIE" "$BASE/api/staff/messages" >/tmp/ci-msg-after-change.json
node --input-type=module -e '
import {readFileSync} from "node:fs";
const x=JSON.parse(readFileSync("/tmp/ci-msg-after-change.json","utf8"));
if(x.items.find(r=>r.student_id==="ci-msg-student-c")?.status!=="CANCELLED")
 throw Error("Held request silently followed a new guardian number");
'
teacherPost=$(curl --silent --show-error -o /dev/null -w '%{http_code}' \
  -b "$TEACHER" -X POST "$BASE/api/staff/messages" "${HEADERS[@]}" --data '{}')
test "$teacherPost" = 403
csrf=$(curl --silent --show-error -o /dev/null -w '%{http_code}' \
  -b "$COOKIE" -X POST "$BASE/api/staff/messages/opt-out" \
  -H 'Origin: https://untrusted.invalid' -H 'Content-Type: application/json' --data '{}')
test "$csrf" = 403
echo "C10 authenticated guardian messaging regression: hold, replay, contact opt-out, contact change and access controls passed; no SMS delivered."
