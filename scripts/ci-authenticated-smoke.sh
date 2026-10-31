#!/usr/bin/env bash
# Preserved authenticated regression/smoke coverage during new architecture transition.
# All D1 operations in this file MUST remain --local. Retire individual assertions
# only after a replacement scenario covers the same domain invariant.
# Extracted from the legacy 1,681-line GitHub workflow to separate CI logic.
set -euo pipefail
DB=d6f3e4e9-2190-43bf-bc90-969687f6db78
pnpm run start >/tmp/sohojac-vite.log 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
for i in $(seq 1 40); do
  if curl -fsS --max-time 4 http://localhost:4173/ >/tmp/sohojac-home.html 2>/dev/null; then break; fi
  sleep 1
done
for route in / /about /faq /journal /interest /privacy /robots.txt /sitemap.xml; do
  curl -fsS --retry 3 --retry-all-errors --retry-delay 1 --max-time 12 "http://localhost:4173$route" >/tmp/route-check || {
    cat /tmp/sohojac-vite.log
    exit 1
  }
done
grep -q "Learning should be" /tmp/sohojac-home.html
for route in /sign-in /forgot-password /reset-password /request-access /accept-invitation; do
  code=$(curl -sS -o /tmp/staff-auth-page.html -w '%{http_code}' "http://localhost:4173$route")
  echo "Auth route $route returned $code"
  if [ "$code" != "200" ]; then
    tail -n 100 /tmp/sohojac-vite.log | sed -E 's/(token|password|secret|email)=([^ ]+)/\\1=[REDACTED]/gi'
    exit 1
  fi
done
curl -fsS "http://localhost:4173/request-access" > /tmp/access-request-page.html
grep -q "Request staff access" /tmp/access-request-page.html

curl -fsS http://localhost:4173/api/security/challenge > /tmp/local-security-config.json
node -e 'const x=require("/tmp/local-security-config.json");if(x.required!==false||x.ready!==true)process.exit(1);'

# Anonymous access requests only create review records, never a login.
anonymous_queue=$(curl -sS -o /tmp/private-access-queue.json -w '%{http_code}' \
  "http://localhost:4173/api/staff/access-requests")
test "$anonymous_queue" = "401"
invalid_access=$(curl -sS -o /tmp/invalid-access.json -w '%{http_code}' \
  -X POST "http://localhost:4173/api/staff/access-request" \
  -H "Origin: http://localhost:4173" -H "Content-Type: application/json" \
  --data '{"fullName":"T","email":"x","mobile":"123","requestedRole":"OWNER","purpose":"x","consent":true}')
test "$invalid_access" = "400"
valid_access=$(curl -sS -o /tmp/valid-access.json -w '%{http_code}' \
  -X POST "http://localhost:4173/api/staff/access-request" \
  -H "Origin: http://localhost:4173" -H "Content-Type: application/json" \
  --data '{"fullName":"Synthetic Staff Applicant","email":"applicant-ci@example.invalid","mobile":"01700000002","requestedRole":"TEACHER","purpose":"Synthetic teacher access verification","consent":true,"website":"","turnstileToken":""}')
test "$valid_access" = "202"
duplicate_access=$(curl -sS -o /tmp/duplicate-access.json -w '%{http_code}' \
  -X POST "http://localhost:4173/api/staff/access-request" \
  -H "Origin: http://localhost:4173" -H "Content-Type: application/json" \
  --data '{"fullName":"Synthetic Staff Applicant","email":"applicant-ci@example.invalid","mobile":"01700000002","requestedRole":"TEACHER","purpose":"Synthetic teacher access verification","consent":true,"website":"","turnstileToken":""}')
test "$duplicate_access" = "202"
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state \
  --sql "SELECT COUNT(*) FROM staff_access_requests WHERE email='applicant-ci@example.invalid' AND status='PENDING'" > /tmp/access-count.json
node -e 'const r=require("/tmp/access-count.json");if(r[0]?.results?.rows?.[0]?.[0]!==1)process.exit(1);'

curl -fsS --max-time 20 -X POST "http://localhost:4173/api/enquiries" \
  -H "Content-Type: application/json" \
  --data '{"intent":"interest","offeringId":"","studentName":"Smoke Test Student","className":"Class 8","guardianName":"Smoke Test Guardian","mobile":"01700000000","subjectNames":["English"],"preferredSchedule":"","preferredDays":[],"trialInterest":false,"consent":true,"website":"","turnstileToken":""}' \
  >/tmp/sohojac-enquiry.json || {
    cat /tmp/sohojac-vite.log
    cat /tmp/sohojac-enquiry.json || true
    exit 1
  }
# Public submissions are rate-limited for ONE MINUTE. Check immediately
# after the first submission, not after the multi-minute ERP test suite.
# A second submission with the same contact must be rate-limited.
duplicate_status=$(curl -sS -o /tmp/enquiry-duplicate.json -w '%{http_code}' -X POST "http://localhost:4173/api/enquiries" \
  -H "Content-Type: application/json" \
  --data '{"intent":"interest","offeringId":"","studentName":"Smoke Test Student","className":"Class 8","guardianName":"Smoke Test Guardian","mobile":"01700000000","subjectNames":[],"preferredSchedule":"","preferredDays":[],"trialInterest":false,"consent":true,"website":"","turnstileToken":""}')
echo "duplicate_status: $duplicate_status"
test "$duplicate_status" = "429"

# Private staff resources are never readable anonymously.
private_status=$(curl -sS -o /tmp/sohojac-private.json -w '%{http_code}' "http://localhost:4173/api/staff/prospects")
test "$private_status" = "401"
private_update_status=$(curl -sS -o /tmp/sohojac-private-update.json -w '%{http_code}' \
  -X PATCH "http://localhost:4173/api/staff/prospects/00000000-0000-0000-0000-000000000000" \
  -H "Origin: http://localhost:4173" -H "Content-Type: application/json" \
  --data '{"status":"CLOSED","note":"Unauthorized"}')
test "$private_update_status" = "401"
signin_signup_status=$(curl -sS -o /tmp/sohojac-signup.json -w '%{http_code}' \
  -X POST "http://localhost:4173/api/auth/sign-up/email" \
  -H "Origin: http://localhost:4173" -H "Content-Type: application/json" \
  --data '{"name":"Attacker","email":"attacker@example.invalid","password":"notasecret123456"}')
# Public self-signup must stay blocked even when staff auth is configured.
test "$signin_signup_status" -ge 400

# Cloudflare Dashboard issues the only setup ticket. A wrong ticket
# must fail; a correct ticket creates user + account + OWNER in D1.
bad_setup=$(curl -sS -o /tmp/bad-setup.json -w '%{http_code}' \
  -X POST "http://localhost:4173/api/setup-owner" \
  -H "Origin: http://localhost:4173" -H "Content-Type: application/json" \
  --data '{"token":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","password":"Test123!"}')
test "$bad_setup" = "403"
owner_setup=$(curl -sS -o /tmp/owner-setup.json -w '%{http_code}' \
  -X POST "http://localhost:4173/api/setup-owner" \
  -H "Origin: http://localhost:4173" -H "Content-Type: application/json" \
  --data '{"token":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","password":"Test123!"}')
echo "first owner setup HTTP: $owner_setup"
test "$owner_setup" = "201"
reused_setup=$(curl -sS -o /tmp/reused-setup.json -w '%{http_code}' \
  -X POST "http://localhost:4173/api/setup-owner" \
  -H "Origin: http://localhost:4173" -H "Content-Type: application/json" \
  --data '{"token":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","password":"Test123!"}')
test "$reused_setup" = "403"

# Real Better Auth sign-in and D1 role check with a synthetic local
# staff user. No production secrets or real guardian data are used.
signin_status=$(curl -sS -o /tmp/staff-signin.json -w '%{http_code}' \
  -c /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/auth/sign-in/email" \
  -H "Origin: http://localhost:4173" -H "Content-Type: application/json" \
  --data '{"email":"staff-ci@example.invalid","password":"Test123!"}')
echo "staff sign-in HTTP status: $signin_status"
test "$signin_status" = "200"
# Original CRM screen must render the same governed public intake,
# and every new public submission must appear in the Student Bank.
DB=d6f3e4e9-2190-43bf-bc90-969687f6db78
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state --sql \
  "INSERT INTO public_enquiries(id,reference,intent,student_name,class_name,guardian_name,mobile,consent_at,school_name,status) VALUES ('11111111-1111-4111-8111-111111111111','CI-CRM-ONE','interest','Test CRM Student','Class 8','Test CRM Guardian','01711111111',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'School Pending Review','NEW')" > /tmp/ci-crm-created.json
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state --sql \
  "SELECT prospect_no,status FROM academy_prospects WHERE id='11111111-1111-4111-8111-111111111111'" > /tmp/ci-crm-prospect.json
echo "CRM INSERT result:"; cat /tmp/ci-crm-created.json
echo "CRM SELECT result:"; cat /tmp/ci-crm-prospect.json
crm_no=$(grep -oE 'PR-[0-9]{6}' /tmp/ci-crm-prospect.json | head -n1)
echo "Synthetic D1 prospect number: $crm_no"
test -n "$crm_no"
# Historical CLOSED records must not be guessed as lost or converted.
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state --sql \
  "INSERT INTO public_enquiries(id,reference,intent,student_name,class_name,guardian_name,mobile,consent_at,status) VALUES ('22222222-2222-4222-8222-222222222222','CI-LEGACY-CLOSED','interest','Historical Student','Class 8','Historical Guardian','01722222222',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'CLOSED')" > /tmp/ci-history-insert.json
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state --sql \
  "SELECT status,lost_reason FROM academy_prospects WHERE id='22222222-2222-4222-8222-222222222222'" > /tmp/ci-history-before.json
grep -q 'LEGACY_CLOSED' /tmp/ci-history-before.json
legacy_detail=$(curl -sS --max-time 20 -o /tmp/ci-history-page.html -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/crm/prospects/22222222-2222-4222-8222-222222222222")
test "$legacy_detail" = "200"
grep -q 'Reconcile old CLOSED status' /tmp/ci-history-page.html
legacy_bypass=$(curl -sS -o /tmp/ci-legacy-bypass.json -w '%{http_code}' \
  -b /tmp/staff-ci-cookies -X PATCH \
  "http://localhost:4173/api/staff/prospects/22222222-2222-4222-8222-222222222222" \
  -H "Origin: http://localhost:4173" -H "Content-Type: application/json" \
  --data '{"status":"CONTACTED","note":"Unreviewed legacy change"}')
test "$legacy_bypass" = "409"
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state --sql \
  "SELECT status FROM academy_prospects WHERE id='22222222-2222-4222-8222-222222222222'" > /tmp/ci-history-after.json
grep -q 'LEGACY_CLOSED' /tmp/ci-history-after.json
crm_list=$(curl -sS --max-time 20 -o /tmp/ci-crm-list.html -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/crm/prospects")
echo "Source CRM list HTTP: $crm_list"
test "$crm_list" = "200"
grep -q 'Test CRM Student' /tmp/ci-crm-list.html
grep -q "$crm_no" /tmp/ci-crm-list.html
crm_detail=$(curl -sS --max-time 20 -o /tmp/ci-crm-detail.html -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/crm/prospects/11111111-1111-4111-8111-111111111111")
echo "Source CRM detail HTTP: $crm_detail"
test "$crm_detail" = "200"
grep -q 'Record Follow-up' /tmp/ci-crm-detail.html
grep -q 'School Pending Review' /tmp/ci-crm-detail.html
grep -q 'Follow-up Timeline' /tmp/ci-crm-detail.html
original_website_management=$(curl -sS -o /tmp/ci-original-website-management.html -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/crm/manage")
echo "Original Website Management HTTP: $original_website_management"
test "$original_website_management" = "200"
grep -q "Website management" /tmp/ci-original-website-management.html
grep -q "Programme showcase" /tmp/ci-original-website-management.html
grep -q "Edit public content" /tmp/ci-original-website-management.html

anonymous_crm=$(curl -sS -o /dev/null -w '%{http_code}' \
  "http://localhost:4173/dashboard/crm/prospects")
test "$anonymous_crm" != "200"
# Legacy /app can still update coarse public status, but a D1 trigger
# must keep canonical Student Bank status aligned.
legacy_crm_patch=$(curl -sS -o /tmp/ci-legacy-crm-patch.json -w '%{http_code}' \
  -b /tmp/staff-ci-cookies -X PATCH \
  "http://localhost:4173/api/staff/prospects/11111111-1111-4111-8111-111111111111" \
  -H "Origin: http://localhost:4173" -H "Content-Type: application/json" \
  --data '{"status":"CONTACTED","note":"CI legacy counselling handoff"}')
echo "Legacy CRM status bridge HTTP: $legacy_crm_patch"
test "$legacy_crm_patch" = "200"
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state --sql \
  "SELECT p.status,e.status FROM academy_prospects p JOIN public_enquiries e ON e.id=p.id WHERE p.id='11111111-1111-4111-8111-111111111111'" > /tmp/ci-crm-synced.json
grep -q 'CONTACTED' /tmp/ci-crm-synced.json
# A richer source-managed state must not be overwritten from the
# simplified fallback editor.
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state --sql \
  "UPDATE academy_prospects SET status='COUNSELLING' WHERE id='11111111-1111-4111-8111-111111111111'" > /tmp/ci-crm-advanced.json
blocked_legacy=$(curl -sS -o /tmp/ci-crm-legacy-blocked.json -w '%{http_code}' \
  -b /tmp/staff-ci-cookies -X PATCH \
  "http://localhost:4173/api/staff/prospects/11111111-1111-4111-8111-111111111111" \
  -H "Origin: http://localhost:4173" -H "Content-Type: application/json" \
  --data '{"status":"CLOSED","note":"Must not erase rich counselling state"}')
echo "Legacy advanced-state protection HTTP: $blocked_legacy"
test "$blocked_legacy" = "409"
# Remove ONLY this synthetic local test record, keeping the public
# site's later one-enquiry assertions unchanged.
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state --sql \
  "DELETE FROM staff_prospect_events WHERE enquiry_id='11111111-1111-4111-8111-111111111111'" > /tmp/ci-crm-clean-events.json
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state --sql \
  "DELETE FROM academy_prospects WHERE id='11111111-1111-4111-8111-111111111111'" > /tmp/ci-crm-clean-master.json
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state --sql \
  "DELETE FROM public_enquiries WHERE id='11111111-1111-4111-8111-111111111111'" > /tmp/ci-crm-clean-public.json


# Source ERP shell must be active only for signed-in D1 staff;
# unauthenticated visits must not expose the new dashboard.
dashboard_status=$(curl -sS --max-time 20 -o /tmp/ci-legacy-dashboard.html -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard")
echo "original ERP dashboard HTTP: $dashboard_status"
test "$dashboard_status" = "200"
grep -q "Digital Campus" /tmp/ci-legacy-dashboard.html
launch_status=$(curl -sS --max-time 20 -o /tmp/ci-programme-launch.html -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/academics/launch")
echo "operator-first programme launch HTTP: $launch_status"
test "$launch_status" = "200"
grep -q "Programme Launch" /tmp/ci-programme-launch.html
grep -q "Working on" /tmp/ci-programme-launch.html
anonymous_launch=$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' \
  "http://localhost:4173/dashboard/academics/launch")
test "$anonymous_launch" != "200"
original_settings=$(curl -sS --max-time 20 -o /tmp/ci-original-settings.html -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/academics/settings")
echo "source academic settings on D1 HTTP: $original_settings"
test "$original_settings" = "200"
grep -q "Academic &amp; registration settings\|Academic & registration settings" /tmp/ci-original-settings.html
anonymous_dashboard=$(curl -sS -o /dev/null -w '%{http_code}' \
  "http://localhost:4173/dashboard")
echo "anonymous ERP dashboard HTTP: $anonymous_dashboard"
test "$anonymous_dashboard" != "200"
          staff_list_status=$(curl -sS -o /tmp/staff-prospects.json -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/api/staff/prospects")
test "$staff_list_status" = "200"

# Owner can verify a request, but verification never creates a login.
queue_code=$(curl -sS -o /tmp/owner-access-queue.json -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/api/staff/access-requests")
test "$queue_code" = "200"
access_id=$(node -e 'const fs=require("fs");const r=JSON.parse(fs.readFileSync("/tmp/owner-access-queue.json","utf8"));const item=r.items.find(x=>x.email==="applicant-ci@example.invalid");if(!item)process.exit(1);process.stdout.write(item.id)')
review_code=$(curl -sS -o /tmp/owner-review.json -w '%{http_code}' \
  -b /tmp/staff-ci-cookies -X PATCH "http://localhost:4173/api/staff/access-requests/$access_id" \
  -H "Origin: http://localhost:4173" -H "Content-Type: application/json" \
  --data '{"decision":"VERIFIED","assignedRole":"TEACHER","note":"Identity confirmed in synthetic local CI test"}')
echo "access review HTTP: $review_code"
test "$review_code" = "200"
reviewed_again=$(curl -sS -o /tmp/access-retry.json -w '%{http_code}' \
  -b /tmp/staff-ci-cookies -X PATCH "http://localhost:4173/api/staff/access-requests/$access_id" \
  -H "Origin: http://localhost:4173" -H "Content-Type: application/json" \
  --data '{"decision":"VERIFIED","assignedRole":"TEACHER","note":"Attempt to verify again must be denied"}')
test "$reviewed_again" = "409"
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state \
  --sql "SELECT (SELECT COUNT(*) FROM staff_access_requests WHERE status='VERIFIED'), (SELECT COUNT(*) FROM erp_audit_events WHERE entity_type='staff_access_request'), (SELECT COUNT(*) FROM \"user\")" > /tmp/access-verified.json
node -e 'const r=require("/tmp/access-verified.json");const n=r[0]?.results?.rows?.[0];if(n?.[0]!==1||n?.[1]!==1||n?.[2]!==1)process.exit(1);'

# No provider configured: sending an invitation must fail closed,
# not issue an unverified login or expose a token.
email_missing=$(curl -sS -o /tmp/unsent-invite.json -w '%{http_code}' \
  -b /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/staff/access-requests/$access_id/invite" \
  -H "Origin: http://localhost:4173" -H "Content-Type: application/json" --data '{}')
test "$email_missing" = "503"

# Simulate the VERIFIED -> INVITED mail-delivery step in isolated
# local D1 only, then validate activation, replay protection, and
# teacher's lack of access to guardian details.
invitation_token=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
invitation_hash=$(node -e 'process.stdout.write(require("node:crypto").createHash("sha256").update(process.argv[1]).digest("hex"))' "$invitation_token")
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state \
  --sql "UPDATE staff_access_requests SET status='INVITED' WHERE id='$access_id'" > /tmp/ci-invite-state.json
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state \
  --sql "INSERT INTO staff_invitation_tokens (id,request_id,token_hash,expires_at,created_by) SELECT '11111111-1111-4111-8111-111111111111','$access_id','$invitation_hash',strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 day'),id FROM \"user\" WHERE email='staff-ci@example.invalid'" > /tmp/ci-invite-token.json
invalid_invitation=$(curl -sS -o /tmp/ci-invalid-invite.json -w '%{http_code}' \
  -X POST "http://localhost:4173/api/staff/accept-invitation" \
  -H "Origin: http://localhost:4173" -H "Content-Type: application/json" \
  --data '{"token":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","password":"Employee123!"}')
test "$invalid_invitation" = "403"
accepted=$(curl -sS -o /tmp/ci-accepted-invite.json -w '%{http_code}' \
  -X POST "http://localhost:4173/api/staff/accept-invitation" \
  -H "Origin: http://localhost:4173" -H "Content-Type: application/json" \
  --data '{"token":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","password":"Employee123!"}')
echo "staff activation HTTP: $accepted"
test "$accepted" = "201"
reused=$(curl -sS -o /tmp/ci-reused-invite.json -w '%{http_code}' \
  -X POST "http://localhost:4173/api/staff/accept-invitation" \
  -H "Origin: http://localhost:4173" -H "Content-Type: application/json" \
  --data '{"token":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","password":"Employee123!"}')
echo "staff invitation replay HTTP: $reused"
test "$reused" = "403"
# A staff identity is created atomically with a verified login.
owner_staff_status=$(curl -sS -o /tmp/ci-owner-staff-directory.json -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/api/staff/directory")
echo "owner staff register HTTP: $owner_staff_status"
test "$owner_staff_status" = "200"
original_staff_status=$(curl -sS -o /tmp/ci-original-staff.html -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/staff")
echo "original ERP staff register HTTP: $original_staff_status"
test "$original_staff_status" = "200"
node - <<'NODE'
const fs=require("fs");
const s=fs.readFileSync("/tmp/ci-original-staff.html","utf8");
for(const term of ["SA-STF-000001","Staff ID / name","Staff access requests","Edit details","Mark inactive","NEXT_ERROR","Internal Server Error"]){
  console.log("Staff preview contains "+term+": "+s.includes(term));
}
const i=s.indexOf("Staff");
console.log("Staff preview HTML excerpt: "+s.slice(Math.max(i-60,0),i+450).replace(/[\r\n]/g," "));
NODE
grep -q 'SA-STF-000001' /tmp/ci-original-staff.html
# Original source Staff Register and access queue appear together.
grep -q 'Staff ID / name' /tmp/ci-original-staff.html
grep -q 'Staff access requests' /tmp/ci-original-staff.html
grep -q 'Edit details' /tmp/ci-original-staff.html
grep -q 'Mark inactive' /tmp/ci-original-staff.html
source_help_status=$(curl -sS -o /tmp/ci-source-help.html -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/help")
test "$source_help_status" = "200"
grep -q 'From first setup to daily work' /tmp/ci-source-help.html
source_academic_help=$(curl -sS -o /tmp/ci-academic-help.html -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/help/academics")
test "$source_academic_help" = "200"
grep -q 'Assign a teacher and run a class' /tmp/ci-academic-help.html
source_finance_help=$(curl -sS -o /tmp/ci-finance-help.html -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/help/finance")
test "$source_finance_help" = "200"
anon_help=$(curl -sS -o /dev/null -w '%{http_code}' \
  "http://localhost:4173/dashboard/help")
test "$anon_help" != "200"

anonymous_original_staff=$(curl -sS -o /dev/null -w '%{http_code}' \
  "http://localhost:4173/dashboard/staff")
test "$anonymous_original_staff" != "200"

account_page=$(curl -sS -o /tmp/ci-staff-account.html -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/account")
test "$account_page" = "200"
grep -q 'SA-STF-000001' /tmp/ci-staff-account.html

node -e 'const r=require("/tmp/ci-owner-staff-directory.json").items;if(r.length!==2||r[0].staff_no!=="SA-STF-000002"||r[1].staff_no!=="SA-STF-000001"||r[0].staff_no===r[1].staff_no)process.exit(1)'
anonymous_staff=$(curl -sS -o /dev/null -w '%{http_code}' \
  "http://localhost:4173/api/staff/directory")
test "$anonymous_staff" = "401"
no_login_created=$(curl -sS -o /tmp/ci-offline-staff.json -w '%{http_code}' \
  -b /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/staff/directory" \
  -H "Origin: http://localhost:4173" -H "Content-Type: application/json" \
  --data '{"fullName":"No Login Staff","reason":"Register offline employee"}')
echo "manual staff record HTTP: $no_login_created"
test "$no_login_created" = "201"
node -e 'const x=require("/tmp/ci-offline-staff.json").item;if(x.staff_no!=="SA-STF-000003")process.exit(1)'
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state \
  --sql "SELECT (SELECT COUNT(*) FROM academy_staff),(SELECT COUNT(*) FROM \"user\"),(SELECT COUNT(*) FROM erp_audit_events WHERE entity_type='staff' AND action='CREATED')" > /tmp/ci-staff-counts.json
node -e 'const n=require("/tmp/ci-staff-counts.json")[0]?.results?.rows?.[0];if(n?.[0]!==3||n?.[1]!==2||n?.[2]!==1)process.exit(1)'

teacher_login=$(curl -sS -o /tmp/ci-teacher.json -w '%{http_code}' \
  -c /tmp/teacher-ci-cookies -X POST "http://localhost:4173/api/auth/sign-in/email" \
  -H "Origin: http://localhost:4173" -H "Content-Type: application/json" \
  --data '{"email":"applicant-ci@example.invalid","password":"Employee123!"}')
echo "teacher sign-in HTTP: $teacher_login"
test "$teacher_login" = "200"
teacher_access=$(curl -sS -o /tmp/teacher-forbidden.json -w '%{http_code}' \
  -b /tmp/teacher-ci-cookies "http://localhost:4173/api/staff/prospects")
echo "teacher forbidden prospects HTTP: $teacher_access"
test "$teacher_access" = "403"
teacher_staff_register=$(curl -sS -o /dev/null -w '%{http_code}' \
  -b /tmp/teacher-ci-cookies "http://localhost:4173/api/staff/directory")
test "$teacher_staff_register" = "403"
teacher_staff_create=$(curl -sS -o /dev/null -w '%{http_code}' \
  -b /tmp/teacher-ci-cookies -X POST "http://localhost:4173/api/staff/directory" \
  -H "Origin: http://localhost:4173" -H "Content-Type: application/json" \
  --data '{"fullName":"Not Allowed","reason":"No permission granted"}')
test "$teacher_staff_create" = "403"

teacher_settings=$(curl -sS -o /dev/null -w '%{http_code}' \
  -b /tmp/teacher-ci-cookies "http://localhost:4173/dashboard/academics/settings")
echo "teacher unauthorized academic settings HTTP: $teacher_settings"
test "$teacher_settings" != "200"
teacher_crm=$(curl -sS -o /dev/null -w '%{http_code}' \
  -b /tmp/teacher-ci-cookies "http://localhost:4173/dashboard/crm/prospects")
test "$teacher_crm" != "200"
teacher_website_management=$(curl -sS -o /dev/null -w '%{http_code}' \
  -b /tmp/teacher-ci-cookies "http://localhost:4173/dashboard/crm/manage")
test "$teacher_website_management" != "200"



# Academic-year workflow: owner creates drafts, overlapping active years,
# version-safe edits, irreversible closure and role protection.
anonymous_years=$(curl -sS -o /tmp/ci-anon-years.json -w '%{http_code}' \
  "http://localhost:4173/api/staff/academic-years")
echo "ERP D1 workflow anonymous_years: $anonymous_years"
test "$anonymous_years" = "401"
year_one=$(curl -sS -o /tmp/ci-year-one.json -w '%{http_code}' \
  -b /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/staff/academic-years" \
  -H "Origin: http://localhost:4173" -H "Content-Type: application/json" \
  --data '{"code":"CI2026","title":"Academic Year CI 2026","startsOn":"2026-01-01","endsOn":"2026-12-31"}')
echo "ERP D1 workflow year_one: $year_one"
test "$year_one" = "201"
year_two=$(curl -sS -o /tmp/ci-year-two.json -w '%{http_code}' \
  -b /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/staff/academic-years" \
  -H "Origin: http://localhost:4173" -H "Content-Type: application/json" \
  --data '{"code":"CI2027","title":"Academic Year CI 2027","startsOn":"2027-01-01","endsOn":"2027-12-31"}')
echo "ERP D1 workflow year_two: $year_two"
test "$year_two" = "201"
year_one_id=$(node -e 'process.stdout.write(require("/tmp/ci-year-one.json").id)')
year_two_id=$(node -e 'process.stdout.write(require("/tmp/ci-year-two.json").id)')
year_activate=$(curl -sS -o /tmp/ci-year-activated.json -w '%{http_code}' \
  -b /tmp/staff-ci-cookies -X PATCH "http://localhost:4173/api/staff/academic-years/$year_one_id" \
  -H "Origin: http://localhost:4173" -H "Content-Type: application/json" \
  --data '{"title":"Academic Year CI 2026","startsOn":"2026-01-01","endsOn":"2026-12-31","nextStatus":"ACTIVE","expectedVersion":1,"reason":"Activate academic year in CI"}')
echo "ERP D1 workflow year_activate: $year_activate"
test "$year_activate" = "200"
second_active=$(curl -sS -o /tmp/ci-second-active.json -w '%{http_code}' \
  -b /tmp/staff-ci-cookies -X PATCH "http://localhost:4173/api/staff/academic-years/$year_two_id" \
  -H "Origin: http://localhost:4173" -H "Content-Type: application/json" \
  --data '{"title":"Academic Year CI 2027","startsOn":"2027-01-01","endsOn":"2027-12-31","nextStatus":"ACTIVE","expectedVersion":1,"reason":"Overlapping active years are supported"}')
echo "ERP D1 workflow second_active: $second_active"
test "$second_active" = "200"
year_closed=$(curl -sS -o /tmp/ci-year-closed.json -w '%{http_code}' \
  -b /tmp/staff-ci-cookies -X PATCH "http://localhost:4173/api/staff/academic-years/$year_one_id" \
  -H "Origin: http://localhost:4173" -H "Content-Type: application/json" \
  --data '{"title":"Academic Year CI 2026","startsOn":"2026-01-01","endsOn":"2026-12-31","nextStatus":"CLOSED","expectedVersion":2,"reason":"Close academic year in CI test"}')
echo "ERP D1 workflow year_closed: $year_closed"
test "$year_closed" = "200"
stale_year=$(curl -sS -o /tmp/ci-year-stale.json -w '%{http_code}' \
  -b /tmp/staff-ci-cookies -X PATCH "http://localhost:4173/api/staff/academic-years/$year_one_id" \
  -H "Origin: http://localhost:4173" -H "Content-Type: application/json" \
  --data '{"title":"Stale academic update","nextStatus":"ACTIVE","expectedVersion":2,"reason":"Stale version must fail"}')
echo "ERP D1 workflow stale_year: $stale_year"
test "$stale_year" = "409"
second_now_active=$(curl -sS -o /tmp/ci-second-activate.json -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/api/staff/academic-years")
echo "ERP D1 workflow second_now_active: $second_now_active"
test "$second_now_active" = "200"
node -e 'const a=require("/tmp/ci-second-activate.json").items; if(a.filter(x=>x.status==="ACTIVE").length!==1||a.filter(x=>x.status==="CLOSED").length!==1)process.exit(1);'
teacher_year_read=$(curl -sS -o /tmp/ci-teacher-years.json -w '%{http_code}' \
  -b /tmp/teacher-ci-cookies "http://localhost:4173/api/staff/academic-years")
echo "ERP D1 workflow teacher_year_read: $teacher_year_read"
test "$teacher_year_read" = "200"
teacher_year_write=$(curl -sS -o /tmp/ci-teacher-year-denied.json -w '%{http_code}' \
  -b /tmp/teacher-ci-cookies -X POST "http://localhost:4173/api/staff/academic-years" \
  -H "Origin: http://localhost:4173" -H "Content-Type: application/json" \
  --data '{"code":"DENIED","title":"Teacher cannot create a year"}')
echo "ERP D1 workflow teacher_year_write: $teacher_year_write"
test "$teacher_year_write" = "403"
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state \
  --sql "SELECT (SELECT COUNT(*) FROM academic_years WHERE status='ACTIVE'),(SELECT COUNT(*) FROM erp_audit_events WHERE entity_type='academic_year')" > /tmp/ci-academic-audit.json
node -e 'const n=require("/tmp/ci-academic-audit.json")[0]?.results?.rows?.[0];if(n?.[0]!==1||n?.[1]!==5)process.exit(1);'

pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state \
  --sql "SELECT (SELECT COUNT(*) FROM staff_access_requests WHERE status='ACTIVE'),(SELECT COUNT(*) FROM staff_memberships WHERE role='TEACHER' AND active=1),(SELECT COUNT(*) FROM \"user\")" > /tmp/ci-activated-count.json
node -e 'const n=require("/tmp/ci-activated-count.json")[0]?.results?.rows?.[0];if(n?.[0]!==1||n?.[1]!==1||n?.[2]!==2)process.exit(1);'



# Source ERP is canonical after sign-in; legacy homepage cannot render
# the outdated parallel workbench (even with a valid authenticated session).
grep -q 'router.replace("/dashboard")' app/sign-in/page.tsx
grep -q 'href: "/dashboard/admissions"' modules/platform/navigation/erp-route-registry.ts
legacy_home=$(curl -sS -D /tmp/ci-legacy-home-headers -o /dev/null -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/app")
echo "legacy /app redirect HTTP: $legacy_home"
test "$legacy_home" = "307"
grep -qi 'location: /dashboard' /tmp/ci-legacy-home-headers
canonical_home=$(curl -sS -L -o /tmp/ci-canonical-home.html -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/app")
test "$canonical_home" = "200"
grep -q 'Digital Campus' /tmp/ci-canonical-home.html
# Legacy operational routes not yet migrated remain independently available.
code=$(curl -sS -o /tmp/sohojac-staff-page.html -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/crm/prospects")
test "$code" = "200"

# Only the role-authorized owner can update the synthetic enquiry.
enquiry_id=$(node -e 'const fs=require("fs"); const d=JSON.parse(fs.readFileSync("/tmp/staff-prospects.json","utf8"));const item=d.items?.find(x=>/^01700000000$/.test(x.mobile) && /^Smoke\sTest\sStudent$/.test(x.student_name));if(!item)process.exit(1);process.stdout.write(item.id)')
staff_update_status=$(curl -sS -o /tmp/staff-update.json -w '%{http_code}' \
  -b /tmp/staff-ci-cookies -X PATCH "http://localhost:4173/api/staff/prospects/$enquiry_id" \
  -H "Origin: http://localhost:4173" -H "Content-Type: application/json" \
  --data '{"status":"CONTACTED","note":"CI follow-up test"}')
echo "authorized staff update HTTP status: $staff_update_status"
if [ "$staff_update_status" != "200" ]; then
  echo "Legacy prospect mutation response:"
  cat /tmp/staff-update.json
  pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state --sql \
    "SELECT p.status,p.version,e.status FROM academy_prospects p JOIN public_enquiries e ON e.id=p.id WHERE e.id='$enquiry_id'"
fi

test "$staff_update_status" = "200"
history_status=$(curl -sS -o /tmp/staff-history.json -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/api/staff/prospects/$enquiry_id")
test "$history_status" = "200"
grep -q 'CI follow-up test' /tmp/staff-history.json



# Disposable-local verified context for both canonical and legacy batch adapters.
# Fresh dev references intentionally contain no real campus/programme/price.
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state --sql "
 INSERT OR IGNORE INTO academy_branches(id,code,name) VALUES ('61000000-0000-4000-8000-000000000001','CI-BATCH-CAMPUS','Synthetic local campus');
 INSERT OR IGNORE INTO academy_programmes(id,code,name) VALUES ('61000000-0000-4000-8000-000000000002','CI-BATCH-PROGRAMME','Synthetic local programme');
 INSERT OR IGNORE INTO academic_years(id,code,title,status) VALUES ('61000000-0000-4000-8000-000000000003','CI-BATCH-YEAR','Synthetic local year','ACTIVE');
 INSERT OR IGNORE INTO academy_classes(id,code,name) VALUES ('61000000-0000-4000-8000-000000000004','CI-BATCH-CLASS','Synthetic local class');
 UPDATE public_programme_offerings SET branch_id='61000000-0000-4000-8000-000000000001',program_id='61000000-0000-4000-8000-000000000002',
 academic_year_id='61000000-0000-4000-8000-000000000003',class_id='61000000-0000-4000-8000-000000000004',
 operation_kind='COACHING',offering_status='ACTIVE',is_active=1 WHERE id='sa-ssc-science';
 INSERT INTO academy_fee_plans(id,offering_id,title,monthly_amount_paisa,admission_amount_paisa,active)
 VALUES ('61000000-0000-4000-8000-000000000005','sa-ssc-science','Synthetic local readiness fee',100000,0,1);
" > /tmp/ci-batch-context.json

echo 'CI entering batch lifecycle checks'
# Batch register: authentication, role denial, capacity, concurrency, lifecycle and audit.
anonymous_batch=$(curl -sS -o /tmp/ci-anon-batch.json -w '%{http_code}' "http://localhost:4173/api/staff/batches")
test "$anonymous_batch" = "401"
teacher_batch=$(curl -sS -o /tmp/ci-teacher-batch.json -w '%{http_code}' -b /tmp/teacher-ci-cookies -X POST "http://localhost:4173/api/staff/batches" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" -H "Idempotency-Key: 57000000-0000-4000-8000-000000000001" --data '{}')
test "$teacher_batch" = "403"
oversized_batch=$(curl -sS -o /tmp/ci-oversized-batch.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/staff/batches" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" -H "Idempotency-Key: 57000000-0000-4000-8000-000000000002" --data '{"code":"INVALID","name":"Over capacity","offeringId":"sa-ssc-science","yearId":"","capacity":13,"beginsOn":"","endsOn":"","reason":"Capacity boundary test"}')
test "$oversized_batch" = "400"
batch_create=$(curl -sS -o /tmp/ci-created-batch.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/staff/batches" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" -H "Idempotency-Key: 57000000-0000-4000-8000-000000000003" --data '{"code":"CI-SSC-A","name":"SSC Science CI Batch","offeringId":"sa-ssc-science","yearId":"","capacity":12,"beginsOn":"2027-01-01","endsOn":"2027-06-01","reason":"CI verifies planned batch creation"}')
test "$batch_create" = "201"
batch_id=$(node -e 'process.stdout.write(require("/tmp/ci-created-batch.json").id)')
batch_active=$(curl -sS -o /tmp/ci-active-batch.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X PATCH "http://localhost:4173/api/staff/batches/$batch_id" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" -H "Idempotency-Key: 57000000-0000-4000-8000-000000000004" --data '{"name":"SSC Science CI Batch","capacity":12,"beginsOn":"2027-01-01","endsOn":"2027-06-01","nextStatus":"ACTIVE","expectedVersion":1,"reason":"Activate test batch after approval"}')
test "$batch_active" = "200"
batch_stale=$(curl -sS -o /tmp/ci-stale-batch.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X PATCH "http://localhost:4173/api/staff/batches/$batch_id" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" -H "Idempotency-Key: 57000000-0000-4000-8000-000000000005" --data '{"name":"SSC Science CI Batch","capacity":12,"beginsOn":"","endsOn":"","nextStatus":"ACTIVE","expectedVersion":1,"reason":"Stale version must never win"}')
test "$batch_stale" = "409"
batch_close=$(curl -sS -o /tmp/ci-close-batch.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X PATCH "http://localhost:4173/api/staff/batches/$batch_id" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" -H "Idempotency-Key: 57000000-0000-4000-8000-000000000006" --data '{"name":"SSC Science CI Batch","capacity":12,"beginsOn":"2027-01-01","endsOn":"2027-06-01","nextStatus":"COMPLETED","expectedVersion":2,"reason":"Complete batch in CI lifecycle test"}')
test "$batch_close" = "200"
batch_reopen=$(curl -sS -o /tmp/ci-reopen-batch.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X PATCH "http://localhost:4173/api/staff/batches/$batch_id" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" -H "Idempotency-Key: 57000000-0000-4000-8000-000000000007" --data '{"name":"SSC Science CI Batch","capacity":12,"beginsOn":"","endsOn":"","nextStatus":"ACTIVE","expectedVersion":3,"reason":"Closed batch must not reopen"}')
test "$batch_reopen" = "409"
batch_page=$(curl -sS -o /tmp/ci-batch-page.html -w '%{http_code}' -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/academics/batches")
test "$batch_page" = "200"
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state --sql "SELECT (SELECT COUNT(*) FROM academy_batches WHERE status='COMPLETED' AND capacity=12),(SELECT COUNT(*) FROM erp_audit_events WHERE entity_type='academy_batch')" > /tmp/ci-batches-checked.json
node -e 'const n=require("/tmp/ci-batches-checked.json")[0]?.results?.rows?.[0];if(n?.[0]!==1||n?.[1]!==3)process.exit(1);'


# Source-first offering/fee pages use the original registers with D1.
for source_page in /dashboard/academics/offerings /dashboard/finance/fee-plans; do
  source_page_owner=$(curl -sS -o /tmp/ci-source-offering-page.html -w '%{http_code}' \
    -b /tmp/staff-ci-cookies "http://localhost:4173$source_page")
  test "$source_page_owner" = "200"
  if [ "$source_page" = "/dashboard/academics/offerings" ]; then
    grep -q 'Offering Register' /tmp/ci-source-offering-page.html
    grep -q 'Create offering' /tmp/ci-source-offering-page.html
  else
    grep -q 'Current Fee Plans' /tmp/ci-source-offering-page.html
    grep -q 'Standard Fee Plan' /tmp/ci-source-offering-page.html
  fi
  source_page_anon=$(curl -sS -o /dev/null -w '%{http_code}' "http://localhost:4173$source_page")
  test "$source_page_anon" != "200"
  source_page_teacher=$(curl -sS -o /dev/null -w '%{http_code}' \
    -b /tmp/teacher-ci-cookies "http://localhost:4173$source_page")
  test "$source_page_teacher" != "200"
done

# The original academic batch register is isolated from admissions PII.
source_batch_owner=$(curl -sS -o /tmp/ci-source-batch-register.html -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/academics/batches")
test "$source_batch_owner" = "200"
grep -q 'Batch register' /tmp/ci-source-batch-register.html
grep -q 'Create batch' /tmp/ci-source-batch-register.html
source_batch_anon=$(curl -sS -o /dev/null -w '%{http_code}' "http://localhost:4173/dashboard/academics/batches")
test "$source_batch_anon" != "200"
source_batch_teacher=$(curl -sS -o /dev/null -w '%{http_code}' \
  -b /tmp/teacher-ci-cookies "http://localhost:4173/dashboard/academics/batches")
test "$source_batch_teacher" != "200"

echo 'CI entering fee plan checks'
# Fee plans: integer paisa, owner/teacher role checks, audit and concurrency.
unauth_fee=$(curl -sS -o /tmp/ci-unauth-fees.json -w '%{http_code}' "http://localhost:4173/api/staff/fee-plans")
test "$unauth_fee" = "401"
teacher_fee=$(curl -sS -o /tmp/ci-teacher-fees.json -w '%{http_code}' -b /tmp/teacher-ci-cookies -X POST "http://localhost:4173/api/staff/fee-plans" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" --data '{}')
test "$teacher_fee" = "403"
invalid_fee=$(curl -sS -o /tmp/ci-invalid-fees.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/staff/fee-plans" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" --data '{"offeringId":"sa-ssc-science","title":"Invalid negative","monthlyAmountPaisa":-100,"admissionAmountPaisa":0,"reason":"Reject negative money amounts"}')
test "$invalid_fee" = "400"
created_fee=$(curl -sS -o /tmp/ci-created-fee.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/staff/fee-plans" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" --data '{"offeringId":"sa-ssc-science","title":"CI monthly science","monthlyAmountPaisa":250000,"admissionAmountPaisa":300000,"reason":"Create controlled test fee plan"}')
test "$created_fee" = "201"
fee_id=$(node -e 'process.stdout.write(require("/tmp/ci-created-fee.json").id)')
updated_fee=$(curl -sS -o /tmp/ci-updated-fee.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X PATCH "http://localhost:4173/api/staff/fee-plans/$fee_id" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" --data '{"title":"CI monthly science","monthlyAmountPaisa":260000,"admissionAmountPaisa":300000,"active":false,"expectedVersion":1,"reason":"Archive and update test fee plan"}')
test "$updated_fee" = "200"
stale_fee=$(curl -sS -o /tmp/ci-stale-fee.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X PATCH "http://localhost:4173/api/staff/fee-plans/$fee_id" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" --data '{"title":"Stale CI monthly","monthlyAmountPaisa":999999,"admissionAmountPaisa":0,"active":true,"expectedVersion":1,"reason":"A stale fee update must fail"}')
test "$stale_fee" = "409"
fee_page=$(curl -sS -o /tmp/ci-fee-page.html -w '%{http_code}' -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/finance/fee-plans")
test "$fee_page" = "200"
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state --sql "SELECT (SELECT COUNT(*) FROM academy_fee_plans WHERE monthly_amount_paisa=260000 AND active=0),(SELECT COUNT(*) FROM erp_audit_events WHERE entity_type='academy_fee_plan')" > /tmp/ci-fees-checked.json
node -e 'const n=require("/tmp/ci-fees-checked.json")[0]?.results?.rows?.[0];if(n?.[0]!==1||n?.[1]!==2)process.exit(1);'


echo 'CI entering canonical admission cutover checks'
# Read compatibility remains; old mutation handlers must fail closed.
anonymous_admission=$(curl -sS -o /tmp/ci-anon-admissions.json -w '%{http_code}' "http://localhost:4173/api/staff/admissions")
test "$anonymous_admission" = "401"
teacher_admission=$(curl -sS -o /tmp/ci-teacher-admissions.json -w '%{http_code}' -b /tmp/teacher-ci-cookies "http://localhost:4173/api/staff/admissions")
test "$teacher_admission" = "403"
admission_fee=$(curl -sS -o /tmp/ci-admission-fee.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/staff/fee-plans" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" --data '{"offeringId":"sa-ssc-science","title":"CI admissions standard","monthlyAmountPaisa":250000,"admissionAmountPaisa":150000,"reason":"Admission approval test rate"}')
test "$admission_fee" = "201"
admission_fee_id=$(node -e 'process.stdout.write(require("/tmp/ci-admission-fee.json").id)')
admission_batch=$(curl -sS -o /tmp/ci-admission-batch.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/staff/batches" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" -H "Idempotency-Key: 57000000-0000-4000-8000-000000000008" --data '{"code":"CI-ADM-A","name":"CI Admissions Active","offeringId":"sa-ssc-science","yearId":"","capacity":12,"beginsOn":"","endsOn":"","reason":"Create active batch for admission test"}')
test "$admission_batch" = "201"
admission_batch_id=$(node -e 'process.stdout.write(require("/tmp/ci-admission-batch.json").id)')
activated_batch=$(curl -sS -o /tmp/ci-activated-batch.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X PATCH "http://localhost:4173/api/staff/batches/$admission_batch_id" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" -H "Idempotency-Key: 57000000-0000-4000-8000-000000000009" --data '{"name":"CI Admissions Active","capacity":12,"beginsOn":"","endsOn":"","nextStatus":"ACTIVE","expectedVersion":1,"reason":"Activate CI admission batch"}')
test "$activated_batch" = "200"
# Old simplified writes are retired. Authentication and origin checks
# remain in force; even an owner cannot bypass signed consent/payment.
admission_id=$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')
retired_counts_sql="SELECT (SELECT COUNT(*) FROM academy_admissions),(SELECT COUNT(*) FROM academy_students),(SELECT COUNT(*) FROM academy_enrollments),(SELECT COUNT(*) FROM academy_admission_bills),(SELECT COUNT(*) FROM finance_invoices),(SELECT COUNT(*) FROM finance_payments),(SELECT COUNT(*) FROM academy_admission_consents),(SELECT COUNT(*) FROM academy_admission_referrals),(SELECT COUNT(*) FROM erp_audit_events)"
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state \
  --sql "$retired_counts_sql" > /tmp/ci-retired-before.json
for retired_case in \
  "POST /api/staff/admissions" \
  "PATCH /api/staff/admissions/$admission_id" \
  "POST /api/staff/admissions/$admission_id/bill" \
  "POST /api/staff/admissions/$admission_id/enroll"; do
  read -r retired_method retired_path <<< "$retired_case"
  retired_anon=$(curl -sS -o /tmp/ci-retired-anon.json -w '%{http_code}' \
    -X "$retired_method" "http://localhost:4173$retired_path" \
    -H "Origin: http://localhost:4173" -H "Content-Type: application/json" --data '{}')
  test "$retired_anon" = "401"
  retired_teacher=$(curl -sS -o /tmp/ci-retired-teacher.json -w '%{http_code}' \
    -b /tmp/teacher-ci-cookies -X "$retired_method" "http://localhost:4173$retired_path" \
    -H "Origin: http://localhost:4173" -H "Content-Type: application/json" --data '{}')
  test "$retired_teacher" = "403"
  retired_origin=$(curl -sS -o /tmp/ci-retired-origin.json -w '%{http_code}' \
    -b /tmp/staff-ci-cookies -X "$retired_method" "http://localhost:4173$retired_path" \
    -H "Origin: https://other.invalid" -H "Content-Type: application/json" --data '{}')
  test "$retired_origin" = "403"
  retired_owner=$(curl -sS -o /tmp/ci-retired-owner.json -w '%{http_code}' \
    -b /tmp/staff-ci-cookies -X "$retired_method" "http://localhost:4173$retired_path" \
    -H "Origin: http://localhost:4173" -H "Content-Type: application/json" \
    --data '{"action":"ACCEPT","consentVerified":true,"expectedVersion":1,"reason":"Legacy consent and payment bypass must be refused"}')
  echo "Retired admission mutation $retired_method $retired_path HTTP: $retired_owner"
  test "$retired_owner" = "410"
  node -e 'const r=require("/tmp/ci-retired-owner.json");if(!r.error)process.exit(1)'
done
for retired_case in \
  "PATCH /api/staff/admissions/not-a-uuid" \
  "POST /api/staff/admissions/not-a-uuid/bill" \
  "POST /api/staff/admissions/not-a-uuid/enroll"; do
  read -r retired_method retired_path <<< "$retired_case"
  retired_invalid=$(curl -sS -o /tmp/ci-retired-invalid.json -w '%{http_code}' \
    -b /tmp/staff-ci-cookies -X "$retired_method" "http://localhost:4173$retired_path" \
    -H "Origin: http://localhost:4173" -H "Content-Type: application/json" --data '{}')
  test "$retired_invalid" = "400"
done
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state \
  --sql "$retired_counts_sql" > /tmp/ci-retired-after.json
node -e 'const assert=require("node:assert/strict");assert.deepEqual(require("/tmp/ci-retired-before.json")[0]?.results?.rows,require("/tmp/ci-retired-after.json")[0]?.results?.rows,"Retired mutations must not change any admission/student/financial/audit ledger")'

# Historical records remain readable and collectible. This synthetic
# fixture models a pre-cutover enrollment and never uses a live DB.
# New admissions are exercised through the canonical workflow below.
historical_student_id=$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')
historical_enrollment_id=$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')
historical_invoice_id=$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')
historical_bill_id=$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state --sql "
  INSERT INTO academy_students(id,student_no,full_name,class_grade,guardian_name,guardian_mobile,school_name,status)
  VALUES('$historical_student_id','SA-STD-CI-HISTORICAL','Synthetic Admission Student',10,'Synthetic Guardian','01700000003','CI School','ACTIVE');
  INSERT INTO academy_admissions(id,application_no,offering_id,student_id,status,prepared_by,student_full_name,class_grade,guardian_full_name,guardian_mobile,school_name,batch_id,fee_plan_id,consent_verified,version)
  SELECT '$admission_id','SA-APP-CI-HISTORICAL','sa-ssc-science','$historical_student_id','ENROLLED',id,
    'Synthetic Admission Student',10,'Synthetic Guardian','01700000003','CI School','$admission_batch_id','$admission_fee_id',1,5
  FROM \"user\" WHERE email='staff-ci@example.invalid';
  INSERT INTO academy_admission_bills(id,admission_id,reference,monthly_amount_paisa,admission_amount_paisa,amount_paisa,issue_on,issued_by)
  SELECT '$historical_bill_id','$admission_id','SA-BILL-CI-HISTORICAL',250000,150000,400000,date('now'),id
  FROM \"user\" WHERE email='staff-ci@example.invalid';
  INSERT INTO academy_enrollments(id,student_id,batch_id,admission_id,status)
  VALUES('$historical_enrollment_id','$historical_student_id','$admission_batch_id','$admission_id','ACTIVE');
  INSERT INTO finance_invoices(id,invoice_no,student_id,admission_id,issue_on,amount_paisa,status,created_by)
  SELECT '$historical_invoice_id','SA-BILL-CI-HISTORICAL','$historical_student_id','$admission_id',date('now'),400000,'ISSUED',id
  FROM \"user\" WHERE email='staff-ci@example.invalid';
  INSERT INTO erp_audit_events(id,entity_type,entity_id,action,actor_id,reason,after_json)
  SELECT lower(hex(randomblob(16))),'admission','$admission_id','ENROLLED',id,
    'Synthetic historical fixture for local regression only','{}'
  FROM \"user\" WHERE email='staff-ci@example.invalid';
  " > /tmp/ci-historical-admission.json
node -e 'require("node:fs").writeFileSync("/tmp/ci-enrolled.json",JSON.stringify({ok:true,status:"ENROLLED",studentId:process.argv[1],studentNo:"SA-STD-CI-HISTORICAL",invoiceId:process.argv[2],version:5}))' "$historical_student_id" "$historical_invoice_id"

# Historical /app/admissions links must resolve to the original ERP.
admission_page=$(curl -sS -D /tmp/ci-legacy-admission-headers -o /dev/null -w '%{http_code}' -b /tmp/staff-ci-cookies "http://localhost:4173/app/admissions")
echo "Legacy Admissions redirect HTTP: $admission_page"
test "$admission_page" = "307"
grep -qi 'location: /dashboard/admissions' /tmp/ci-legacy-admission-headers
redirected_admissions=$(curl -sS -L -o /tmp/ci-admission-page.html -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/app/admissions")
test "$redirected_admissions" = "200"
grep -q 'Start an admission' /tmp/ci-admission-page.html
grep -q 'Admission cases' /tmp/ci-admission-page.html
bill_page=$(curl -sS -o /tmp/ci-bill-page.html -w '%{http_code}' -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/admissions/$admission_id/bill")
test "$bill_page" = "200"
grep -q "Initial admission bill" /tmp/ci-bill-page.html
students_api=$(curl -sS -o /tmp/ci-students-api.json -w '%{http_code}' -b /tmp/staff-ci-cookies "http://localhost:4173/api/staff/students")
test "$students_api" = "200"
teacher_students=$(curl -sS -o /tmp/ci-teacher-students.json -w '%{http_code}' -b /tmp/teacher-ci-cookies "http://localhost:4173/api/staff/students")
test "$teacher_students" = "403"
student_page=$(curl -sS -o /tmp/ci-student-page.html -w '%{http_code}' -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/students")
test "$student_page" = "200"

# Source receivables reads authentic historical balances and protects
# contact and financial information with named finance permissions.
receivables_page=$(curl -sS -o /tmp/ci-receivables.html -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/finance/receivables")
test "$receivables_page" = "200"
grep -q 'Receivables &amp; collection follow-up' /tmp/ci-receivables.html
grep -q 'SA-STD-CI-HISTORICAL' /tmp/ci-receivables.html
statement_student=$(node -p 'require("/tmp/ci-enrolled.json").studentId')
guardian_statement=$(curl -sS -o /tmp/ci-guardian-statement.html -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/finance/receivables/$statement_student/print")
test "$guardian_statement" = "200"
grep -q 'STUDENT ACCOUNT STATEMENT' /tmp/ci-guardian-statement.html
grep -q 'SA-BILL-CI-HISTORICAL' /tmp/ci-guardian-statement.html
grep -q '4000.00' /tmp/ci-guardian-statement.html
for finance_path in /dashboard/finance/receivables "/dashboard/finance/receivables/$statement_student/print"; do
  anonymous_receivables=$(curl -sS -o /dev/null -w '%{http_code}' "http://localhost:4173$finance_path")
  test "$anonymous_receivables" != "200"
  teacher_receivables=$(curl -sS -o /dev/null -w '%{http_code}' \
    -b /tmp/teacher-ci-cookies "http://localhost:4173$finance_path")
  test "$teacher_receivables" != "200"
done
missing_statement=$(curl -sS -o /dev/null -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/finance/receivables/99999999-9999-4999-8999-999999999999/print")
test "$missing_statement" = "404"
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state \
  --sql "INSERT INTO erp_permission_grants(user_id,permission) SELECT id,'finance.view' FROM \"user\" WHERE email='applicant-ci@example.invalid'" > /tmp/ci-finance-grant.json
finance_reader=$(curl -sS -o /tmp/ci-finance-reader.html -w '%{http_code}' \
  -b /tmp/teacher-ci-cookies "http://localhost:4173/dashboard/finance/receivables")
test "$finance_reader" = "200"
grep -q 'SA-STD-CI-HISTORICAL' /tmp/ci-finance-reader.html
if grep -q 'Record contact' /tmp/ci-finance-reader.html; then
  echo "View-only finance grant exposed collection mutations"; exit 1
fi
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state \
  --sql "DELETE FROM erp_permission_grants WHERE permission='finance.view' AND user_id IN (SELECT id FROM \"user\" WHERE email='applicant-ci@example.invalid')" > /tmp/ci-finance-revoke.json
finance_revoked=$(curl -sS -o /dev/null -w '%{http_code}' \
  -b /tmp/teacher-ci-cookies "http://localhost:4173/dashboard/finance/receivables")
test "$finance_revoked" != "200"

# Follow the register's real student link through the D1-backed profile.
profile_student_id=$(node -p 'require("/tmp/ci-enrolled.json").studentId')
profile_code=$(curl -sS -o /tmp/ci-student-profile.html -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/students/$profile_student_id")
test "$profile_code" = "200"
node --input-type=module <<'NODE'
import fs from "node:fs";
import assert from "node:assert/strict";
const html=fs.readFileSync("/tmp/ci-student-profile.html","utf8");
const {studentId,studentNo}=JSON.parse(fs.readFileSync("/tmp/ci-enrolled.json","utf8"));
assert(fs.readFileSync("/tmp/ci-student-page.html","utf8").includes("/dashboard/students/"+studentId));
for(const value of [studentNo,"Student Identity","Guardian Contacts","Enrollment History","Admission Cases","Financial History"])
  assert(html.includes(value),"Profile missing "+value);
for(const value of ["Create Enrollment Draft","Confirm Batch Transfer","Duplicate Identity Review"])
  assert(html.includes(value),"Authorized lifecycle control missing: "+value);
NODE
for invalid_student in not-a-student 99999999-9999-4999-8999-999999999999; do
  profile_missing=$(curl -sS -o /tmp/ci-student-missing.html -w '%{http_code}' \
    -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/students/$invalid_student")
  test "$profile_missing" = "404"
done
profile_anon=$(curl -sS -o /tmp/ci-student-anon.html -w '%{http_code}' \
  "http://localhost:4173/dashboard/students/$profile_student_id")
test "$profile_anon" != "200"
profile_teacher=$(curl -sS -o /tmp/ci-student-denied.html -w '%{http_code}' \
  -b /tmp/teacher-ci-cookies "http://localhost:4173/dashboard/students/$profile_student_id")
test "$profile_teacher" != "200"
# A student viewer can read identity/history without being granted finance
# or admission case access. Grants are read again on each request.
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state \
  --sql "INSERT INTO erp_permission_grants(user_id,permission) SELECT id,'students.view' FROM \"user\" WHERE email='applicant-ci@example.invalid'" > /tmp/ci-student-grant.json
profile_viewer=$(curl -sS -o /tmp/ci-student-viewer.html -w '%{http_code}' \
  -b /tmp/teacher-ci-cookies "http://localhost:4173/dashboard/students/$profile_student_id")
test "$profile_viewer" = "200"
node --input-type=module <<'NODE'
import fs from "node:fs";
import assert from "node:assert/strict";
const html=fs.readFileSync("/tmp/ci-student-viewer.html","utf8");
assert(html.includes("Guardian Contacts") && html.includes("Enrollment History"));
assert(!html.includes("Financial History") && !html.includes("Admission Cases"));
for(const value of ["Create Enrollment Draft","Confirm Batch Transfer","Confirm Duplicate Resolution"])
  assert(!html.includes(value),"Read-only viewer exposed a mutation control: "+value);
NODE
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state \
  --sql "DELETE FROM erp_permission_grants WHERE permission='students.view' AND user_id IN (SELECT id FROM \"user\" WHERE email='applicant-ci@example.invalid')" > /tmp/ci-student-revoke.json
profile_revoked=$(curl -sS -o /tmp/ci-student-revoked.html -w '%{http_code}' \
  -b /tmp/teacher-ci-cookies "http://localhost:4173/dashboard/students/$profile_student_id")
test "$profile_revoked" != "200"

# Original Admissions register and two source intake modes.
for source_route in /dashboard/admissions /dashboard/admissions?start=staff /dashboard/admissions?start=enquiry; do
  source_admission_code=$(curl -sS -o /tmp/ci-original-admissions.html -w '%{http_code}' \
    -b /tmp/staff-ci-cookies "http://localhost:4173$source_route")
  echo "Original Admissions $source_route HTTP: $source_admission_code"
  test "$source_admission_code" = "200"
  grep -q 'Start an admission' /tmp/ci-original-admissions.html
  grep -q 'Admission cases' /tmp/ci-original-admissions.html
done
original_staff_intake=$(curl -sS -o /tmp/ci-original-staff-intake.html -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/admissions?start=staff")
test "$original_staff_intake" = "200"
grep -q 'Enter a new applicant online' /tmp/ci-original-staff-intake.html
anon_source_admissions=$(curl -sS -o /dev/null -w '%{http_code}' \
  "http://localhost:4173/dashboard/admissions")
test "$anon_source_admissions" != "200"
teacher_source_admissions=$(curl -sS -o /dev/null -w '%{http_code}' \
  -b /tmp/teacher-ci-cookies "http://localhost:4173/dashboard/admissions")
test "$teacher_source_admissions" != "200"
# Original sidebar links should open actual case data, not 404.
source_case=$(curl -sS -o /tmp/ci-source-case.html -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/admissions/$admission_id")
echo "Source case detail bridge HTTP: $source_case"
test "$source_case" = "200"
legacy_case_code=$(curl -sS -D /tmp/ci-legacy-case-headers -o /dev/null -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/app/admissions/$admission_id")
test "$legacy_case_code" = "307"
grep -qi "location: /dashboard/admissions/$admission_id" /tmp/ci-legacy-case-headers
grep -q 'Verify application and placement' /tmp/ci-source-case.html
grep -q 'Record Organic or referrer' /tmp/ci-source-case.html
grep -q 'Receive signed paper consent' /tmp/ci-source-case.html
grep -q 'Review fees and confirm admission' /tmp/ci-source-case.html
grep -q 'Payment and enrollment' /tmp/ci-source-case.html
grep -q 'Application record' /tmp/ci-source-case.html
anonymous_case=$(curl -sS -o /dev/null -w '%{http_code}' \
  "http://localhost:4173/dashboard/admissions/$admission_id")
test "$anonymous_case" != "200"
teacher_source_case=$(curl -sS -o /dev/null -w '%{http_code}' \
  -b /tmp/teacher-ci-cookies "http://localhost:4173/dashboard/admissions/$admission_id")
test "$teacher_source_case" != "200"
# Original source case print route must map real D1 student and charges.
source_case_print=$(curl -sS -o /tmp/ci-source-case-print.html -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/admissions/$admission_id/print")
echo "Original case print HTTP: $source_case_print"
test "$source_case_print" = "200"
grep -q 'Admission application' /tmp/ci-source-case-print.html
grep -q 'Print / Save PDF' /tmp/ci-source-case-print.html
anonymous_source_case_print=$(curl -sS -o /dev/null -w '%{http_code}' \
  "http://localhost:4173/dashboard/admissions/$admission_id/print")
test "$anonymous_source_case_print" != "200"
teacher_source_case_print=$(curl -sS -o /dev/null -w '%{http_code}' \
  -b /tmp/teacher-ci-cookies "http://localhost:4173/dashboard/admissions/$admission_id/print")
test "$teacher_source_case_print" != "200"
receipt_not_in_this_case=$(curl -sS -o /dev/null -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/admissions/$admission_id/print?receipt=unknown")
test "$receipt_not_in_this_case" = "404"
# Original paper application: source A4 print preview, no mutations.
original_blank_application=$(curl -sS -o /tmp/ci-source-admission-paper.html -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/admissions/application-form")
echo "Source printable admission form HTTP: $original_blank_application"
test "$original_blank_application" = "200"
grep -q 'Admission application' /tmp/ci-source-admission-paper.html
grep -q 'Print / Save PDF' /tmp/ci-source-admission-paper.html
grep -q 'This application alone does not confirm admission' /tmp/ci-source-admission-paper.html
anonymous_blank_application=$(curl -sS -o /dev/null -w '%{http_code}' \
  "http://localhost:4173/dashboard/admissions/application-form")
test "$anonymous_blank_application" != "200"
teacher_blank_application=$(curl -sS -o /dev/null -w '%{http_code}' \
  -b /tmp/teacher-ci-cookies "http://localhost:4173/dashboard/admissions/application-form")
test "$teacher_blank_application" != "200"
# Original (not the simplified /app) register must show the same
# enrolled canonical student and retain staff permission boundaries.
source_students=$(curl -sS -o /tmp/ci-original-students.html -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/students")
echo "Original Student Register HTTP: $source_students"
test "$source_students" = "200"
grep -q 'Student ID' /tmp/ci-original-students.html
grep -q 'Search student ID, name or school' /tmp/ci-original-students.html
student_no=$(node -e 'const r=require("/tmp/ci-students-api.json");if(!r.items?.[0]?.student_no)process.exit(1);process.stdout.write(r.items[0].student_no)')
grep -Fq "$student_no" /tmp/ci-original-students.html
empty_students=$(curl -sS -o /tmp/ci-filtered-students.html -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/students?q=CI-nonexistent-unknown")
test "$empty_students" = "200"
grep -q 'No admitted students yet' /tmp/ci-filtered-students.html
anonymous_students=$(curl -sS -o /dev/null -w '%{http_code}' \
  "http://localhost:4173/dashboard/students")
test "$anonymous_students" != "200"
teacher_source_students=$(curl -sS -o /dev/null -w '%{http_code}' \
  -b /tmp/teacher-ci-cookies "http://localhost:4173/dashboard/students")
test "$teacher_source_students" != "200"
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state --sql "SELECT (SELECT COUNT(*) FROM academy_admissions WHERE status='ENROLLED' AND student_id IS NOT NULL),(SELECT COUNT(*) FROM academy_students),(SELECT COUNT(*) FROM academy_enrollments WHERE status='ACTIVE'),(SELECT COUNT(*) FROM finance_invoices WHERE amount_paisa=400000 AND paid_paisa=0 AND status='ISSUED'),(SELECT COUNT(*) FROM finance_payments),(SELECT COUNT(*) FROM erp_audit_events WHERE action='ENROLLED')" > /tmp/ci-enrollment-verified.json
node -e 'const n=require("/tmp/ci-enrollment-verified.json")[0]?.results?.rows?.[0];if(n?.[0]!==1||n?.[1]!==1||n?.[2]!==1||n?.[3]!==1||n?.[4]!==0||n?.[5]!==1)process.exit(1);'


echo 'CI entering printable form checks'
# A4 signature form must be available to an authenticated operator.
consent_form=$(curl -sS -o /tmp/ci-admission-form.html -w '%{http_code}' -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/admissions/$admission_id/print")
test "$consent_form" = "200"
grep -q "Student signature" /tmp/ci-admission-form.html
grep -q "Guardian signature" /tmp/ci-admission-form.html
grep -q "Verified programme" /tmp/ci-admission-form.html
grep -q "Academy seal" /tmp/ci-admission-form.html


echo 'CI entering tuition collection and GL checks'
# Tuition collections: only actual payments, no over-allocation, balanced GL.
anonymous_collection=$(curl -sS -o /tmp/ci-anon-collection.json -w '%{http_code}' "http://localhost:4173/api/staff/collections")
test "$anonymous_collection" = "401"
teacher_collection=$(curl -sS -o /tmp/ci-teacher-collection.json -w '%{http_code}' -b /tmp/teacher-ci-cookies "http://localhost:4173/api/staff/collections")
test "$teacher_collection" = "403"
invoice_id=$(node -e 'const fs=require("fs");const d=JSON.parse(fs.readFileSync("/tmp/ci-students-api.json","utf8"));const row=d.items?.[0];if(!row?.invoice_no)process.exit(1);process.stdout.write(row.invoice_no)')
# Invoice ID comes from the authenticated collections list; invoice_no is display-only.
curl -fsS -b /tmp/staff-ci-cookies "http://localhost:4173/api/staff/collections" > /tmp/ci-collection-list.json
invoice_id=$(node -e 'const d=require("/tmp/ci-collection-list.json");if(!d.invoices?.length)process.exit(1);process.stdout.write(d.invoices[0].id)')
invalid_collection=$(curl -sS -o /tmp/ci-invalid-collection.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/staff/collections" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" -H "Idempotency-Key: 57000000-0000-4000-8000-000000000010" --data "{\"invoiceId\":\"$invoice_id\",\"amountPaisa\":0,\"method\":\"CASH\",\"reference\":\"\",\"reason\":\"Zero money is not a payment\"}")
test "$invalid_collection" = "400"
collection_one=$(curl -sS -o /tmp/ci-collection-one.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/staff/collections" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" -H "Idempotency-Key: 57000000-0000-4000-8000-000000000011" --data "{\"invoiceId\":\"$invoice_id\",\"amountPaisa\":200000,\"method\":\"CASH\",\"reference\":\"\",\"reason\":\"Received cash in synthetic CI test\"}")
echo "First collection HTTP: $collection_one"
if [ "$collection_one" != "201" ]; then cat /tmp/ci-collection-one.json; fi
test "$collection_one" = "201"

# Repeated HTTP intent returns the exact original receipt, even with unpaid balance.
collection_replay=$(curl -sS -o /tmp/ci-collection-replay.json -w '%{http_code}' -b /tmp/staff-ci-cookies \
 -X POST "http://localhost:4173/api/staff/collections" -H "Origin: http://localhost:4173" \
 -H "Content-Type: application/json" -H "Idempotency-Key: 57000000-0000-4000-8000-000000000011" \
 --data "{\"invoiceId\":\"$invoice_id\",\"amountPaisa\":200000,\"method\":\"CASH\",\"reference\":\"\",\"reason\":\"Received cash in synthetic CI test\"}")
test "$collection_replay" = "200"
node -e 'const assert=require("node:assert/strict");const first=require("/tmp/ci-collection-one.json"),retry=require("/tmp/ci-collection-replay.json");assert.equal(retry.id,first.id);assert.equal(retry.receiptNo,first.receiptNo);assert.equal(retry.remainingDuePaisa,200000)'
payment_result=$(curl -sS -o /tmp/ci-payment-result.json -w '%{http_code}' -b /tmp/staff-ci-cookies \
 "http://localhost:4173/api/staff/collections?requestId=57000000-0000-4000-8000-000000000011")
test "$payment_result" = "200"
node -e 'const assert=require("node:assert/strict");assert.equal(require("/tmp/ci-payment-result.json").id,require("/tmp/ci-collection-one.json").id)'
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state \
 --sql "SELECT (SELECT COUNT(*) FROM finance_payments),(SELECT COUNT(*) FROM finance_allocations),(SELECT COUNT(*) FROM finance_payment_commands)" > /tmp/ci-retry-count.json
node -e 'const assert=require("node:assert/strict");assert.deepEqual(require("/tmp/ci-retry-count.json")[0].results.rows[0],[1,1,1])'

over_collection=$(curl -sS -o /tmp/ci-over-collection.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/staff/collections" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" -H "Idempotency-Key: 57000000-0000-4000-8000-000000000012" --data "{\"invoiceId\":\"$invoice_id\",\"amountPaisa\":300000,\"method\":\"BANK\",\"reference\":\"\",\"reason\":\"Overpayment must be refused\"}")
test "$over_collection" = "409"
collection_two=$(curl -sS -o /tmp/ci-collection-two.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/staff/collections" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" -H "Idempotency-Key: 57000000-0000-4000-8000-000000000013" --data "{\"invoiceId\":\"$invoice_id\",\"amountPaisa\":200000,\"method\":\"MFS\",\"reference\":\"MFS-CI-1\",\"reason\":\"Second verified payment closes invoice\"}")
echo "Second collection HTTP: $collection_two"
if [ "$collection_two" != "201" ]; then cat /tmp/ci-collection-two.json; fi
test "$collection_two" = "201"
settled_collection=$(curl -sS -o /tmp/ci-settled-collection.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/staff/collections" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" -H "Idempotency-Key: 57000000-0000-4000-8000-000000000014" --data "{\"invoiceId\":\"$invoice_id\",\"amountPaisa\":1,\"method\":\"CASH\",\"reference\":\"\",\"reason\":\"Settled invoices reject new money\"}")
test "$settled_collection" = "409"
collections_page=$(curl -sS -o /tmp/ci-collections-page.html -w '%{http_code}' -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/finance/collections")
test "$collections_page" = "200"
# Billing is a genuine permission-gated D1 receivables workspace,
# not a redirect back to Collections.
billing_page=$(curl -sS -o /tmp/ci-billing-page.html -w '%{http_code}' -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/finance/billing")
echo "D1 Student Billing page HTTP: $billing_page"
test "$billing_page" = "200"
grep -q 'Student billing &amp; receivables' /tmp/ci-billing-page.html
grep -q 'Search invoice, student name or ID' /tmp/ci-billing-page.html
anonymous_billing=$(curl -sS -o /dev/null -w '%{http_code}' "http://localhost:4173/dashboard/finance/billing")
test "$anonymous_billing" != "200"
teacher_billing=$(curl -sS -o /dev/null -w '%{http_code}' -b /tmp/teacher-ci-cookies "http://localhost:4173/dashboard/finance/billing")
test "$teacher_billing" != "200"

pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state --sql "SELECT (SELECT COUNT(*) FROM finance_invoices WHERE paid_paisa=400000 AND amount_paisa=400000 AND status='PAID'),(SELECT COUNT(*) FROM finance_payments),(SELECT COUNT(*) FROM finance_allocations),(SELECT COUNT(*) FROM finance_journals WHERE status='POSTED'),(SELECT SUM(debit_paisa) FROM finance_journal_lines),(SELECT SUM(credit_paisa) FROM finance_journal_lines)" > /tmp/ci-gl-check.json
cat /tmp/ci-gl-check.json
node -e 'const n=require("/tmp/ci-gl-check.json")[0]?.results?.rows?.[0];if(n?.[0]!==1||n?.[1]!==2||n?.[2]!==2||n?.[3]!==3||n?.[4]!==800000||n?.[5]!==800000)process.exit(1);'

echo 'CI entering student attendance checks'

# Student attendance: real active enrollment, audited correction and stale version.
unauth_attend=$(curl -sS -o /tmp/ci-unauth-attend.json -w '%{http_code}' "http://localhost:4173/api/staff/attendance")
test "$unauth_attend" = "401"
teacher_attend=$(curl -sS -o /tmp/ci-teacher-attend.json -w '%{http_code}' -b /tmp/teacher-ci-cookies "http://localhost:4173/api/staff/attendance")
test "$teacher_attend" = "403"
class_day=$(date -u +%F)
curl -fsS -b /tmp/staff-ci-cookies "http://localhost:4173/api/staff/attendance?batchId=$admission_batch_id&date=$class_day" > /tmp/ci-attendance-list.json
attendance_enrollment_id=$(node -e 'const r=require("/tmp/ci-attendance-list.json");if(r.items?.length!==1)process.exit(1);process.stdout.write(r.items[0].enrollment_id)')
attend_first=$(curl -sS -o /tmp/ci-attend-first.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/staff/attendance" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" --data "{\"enrollmentId\":\"$attendance_enrollment_id\",\"classOn\":\"$class_day\",\"state\":\"PRESENT\",\"expectedVersion\":0,\"reason\":\"CI verifies initial attendance entry\"}")
echo "Attendance first entry HTTP: $attend_first"
if [ "$attend_first" != "200" ]; then cat /tmp/ci-attend-first.json; fi
test "$attend_first" = "200"
attend_stale=$(curl -sS -o /tmp/ci-attend-stale.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/staff/attendance" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" --data "{\"enrollmentId\":\"$attendance_enrollment_id\",\"classOn\":\"$class_day\",\"state\":\"ABSENT\",\"expectedVersion\":0,\"reason\":\"Stale change must not be saved\"}")
test "$attend_stale" = "409"
attend_correct=$(curl -sS -o /tmp/ci-attend-correct.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/staff/attendance" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" --data "{\"enrollmentId\":\"$attendance_enrollment_id\",\"classOn\":\"$class_day\",\"state\":\"LATE\",\"expectedVersion\":1,\"reason\":\"Correction after teacher confirmation\"}")
echo "Attendance correction HTTP: $attend_correct"
if [ "$attend_correct" != "200" ]; then cat /tmp/ci-attend-correct.json; fi
test "$attend_correct" = "200"
attendance_page=$(curl -sS -o /tmp/ci-attendance-page.html -w '%{http_code}' -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/attendance")
test "$attendance_page" = "200"
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state --sql "SELECT (SELECT COUNT(*) FROM academy_attendance WHERE state='LATE' AND version=2),(SELECT COUNT(*) FROM erp_audit_events WHERE entity_type='academy_attendance')" > /tmp/ci-attendance-verified.json
node -e 'const n=require("/tmp/ci-attendance-verified.json")[0]?.results?.rows?.[0];if(n?.[0]!==1||n?.[1]!==2)process.exit(1);'

echo 'CI entering audit viewer checks'

# Governance: only admins may read audit actor/reason (no raw PII JSON).
unauth_audit=$(curl -sS -o /tmp/ci-unauth-audit.json -w '%{http_code}' "http://localhost:4173/api/staff/audit")
test "$unauth_audit" = "401"
teacher_audit=$(curl -sS -o /tmp/ci-teacher-audit.json -w '%{http_code}' -b /tmp/teacher-ci-cookies "http://localhost:4173/api/staff/audit")
test "$teacher_audit" = "403"
owner_audit=$(curl -sS -o /tmp/ci-owner-audit.json -w '%{http_code}' -b /tmp/staff-ci-cookies "http://localhost:4173/api/staff/audit?type=academy_attendance&page=1")
test "$owner_audit" = "200"
node -e 'const x=require("/tmp/ci-owner-audit.json");if(x.items?.length!==2||x.items.some(e=>Object.hasOwn(e,"before_json")||Object.hasOwn(e,"after_json")))process.exit(1);'
audit_page=$(curl -sS -o /tmp/ci-audit-page.html -w '%{http_code}' -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/governance/audit")
test "$audit_page" = "200"
# Source ERP audit page reads the same real D1 events with actor
# identity, rather than showing an empty placeholder.
original_audit=$(curl -sS -o /tmp/ci-source-audit.html -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/governance/audit?entity=academy_attendance")
echo "Original Audit Trail HTTP: $original_audit"
test "$original_audit" = "200"
grep -q 'Audit Trail' /tmp/ci-source-audit.html
grep -q 'academy_attendance' /tmp/ci-source-audit.html
grep -q 'Time' /tmp/ci-source-audit.html
anon_source_audit=$(curl -sS -o /dev/null -w '%{http_code}' \
  "http://localhost:4173/dashboard/governance/audit")
test "$anon_source_audit" != "200"
teacher_source_audit=$(curl -sS -o /dev/null -w '%{http_code}' \
  -b /tmp/teacher-ci-cookies "http://localhost:4173/dashboard/governance/audit")
test "$teacher_source_audit" != "200"
no_matching_audit=$(curl -sS -o /tmp/ci-source-audit-empty.html -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/governance/audit?q=unknown-unique-never-matches")
test "$no_matching_audit" = "200"
grep -q 'No matching events' /tmp/ci-source-audit-empty.html

echo 'CI entering operating expense checks'

# Operating expenses: owner approval, immutable balanced GL and date guard.
anon_expense=$(curl -sS -o /tmp/ci-anon-expense.json -w '%{http_code}' "http://localhost:4173/api/staff/expenses")
test "$anon_expense" = "401"
teacher_expense=$(curl -sS -o /tmp/ci-teacher-expense.json -w '%{http_code}' -b /tmp/teacher-ci-cookies "http://localhost:4173/api/staff/expenses")
test "$teacher_expense" = "403"
invalid_expense=$(curl -sS -o /tmp/ci-invalid-expense.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/staff/expenses" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" -H "Idempotency-Key: 57000000-0000-4000-8000-000000000015" --data '{"category":"RENT","payee":"Synthetic landlord","description":"CI rent payment","spentOn":"2026-01-01","amountPaisa":-500,"method":"CASH","reason":"Reject invalid negative expense"}')
test "$invalid_expense" = "400"
future_expense=$(curl -sS -o /tmp/ci-future-expense.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/staff/expenses" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" -H "Idempotency-Key: 57000000-0000-4000-8000-000000000016" --data '{"category":"RENT","payee":"Synthetic landlord","description":"Future CI rent payment","spentOn":"2099-01-01","amountPaisa":50000,"method":"CASH","reason":"Reject any future expense posting"}')
test "$future_expense" = "400"
expense_spent_on=$(date -u +%F)
posted_expense=$(curl -sS -o /tmp/ci-posted-expense.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/staff/expenses" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" -H "Idempotency-Key: 57000000-0000-4000-8000-000000000017" --data "{\"category\":\"RENT\",\"payee\":\"Synthetic landlord\",\"description\":\"Recorded CI rent payment\",\"spentOn\":\"$expense_spent_on\",\"amountPaisa\":50000,\"method\":\"CASH\",\"reason\":\"Verify cash rent expense accounting entry\"}")
echo "Expense posting HTTP: $posted_expense"
if [ "$posted_expense" != "201" ]; then cat /tmp/ci-posted-expense.json; fi
test "$posted_expense" = "201"
expense_page=$(curl -sS -o /tmp/ci-expense-page.html -w '%{http_code}' -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/finance/expenses")
test "$expense_page" = "200"
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state --sql "SELECT (SELECT COUNT(*) FROM finance_operating_expenses WHERE amount_paisa=50000 AND category='RENT'),(SELECT COUNT(*) FROM erp_audit_events WHERE entity_type='finance_expense'),(SELECT COUNT(*) FROM finance_journals WHERE reference LIKE 'EXP:%' AND status='POSTED'),(SELECT SUM(debit_paisa) FROM finance_journal_lines),(SELECT SUM(credit_paisa) FROM finance_journal_lines)" > /tmp/ci-expense-gl.json
node -e 'const r=require("/tmp/ci-expense-gl.json")[0]?.results?.rows?.[0];if(r?.[0]!==1||r?.[1]!==1||r?.[2]!==1||r?.[3]!==850000||r?.[4]!==850000)process.exit(1);'

echo 'CI entering management reporting checks'

# Financial management reporting separates cash from accrued income.
anon_report=$(curl -sS -o /tmp/ci-anon-report.json -w '%{http_code}' "http://localhost:4173/api/staff/reports")
test "$anon_report" = "401"
teacher_report=$(curl -sS -o /tmp/ci-teacher-report.json -w '%{http_code}' -b /tmp/teacher-ci-cookies "http://localhost:4173/api/staff/reports")
test "$teacher_report" = "403"
invalid_month=$(curl -sS -o /tmp/ci-invalid-report.json -w '%{http_code}' -b /tmp/staff-ci-cookies "http://localhost:4173/api/staff/reports?month=2026-99")
test "$invalid_month" = "400"
report_month=$(date -u +%Y-%m)
report_api=$(curl -sS -o /tmp/ci-report.json -w '%{http_code}' -b /tmp/staff-ci-cookies "http://localhost:4173/api/staff/reports?month=$report_month")
echo "Management report HTTP: $report_api"
test "$report_api" = "200"
node -e 'const r=require("/tmp/ci-report.json");if(r.billedPaisa!==400000||r.collectedPaisa!==400000||r.operatingExpensePaisa!==50000||r.cashMovementPaisa!==350000||r.outstandingPaisa!==0||r.activeStudents!==1||r.ledgerBalanced!==true||r.ledgerDebitsPaisa!==850000||r.ledgerCreditsPaisa!==850000)process.exit(1);'
report_page=$(curl -sS -o /tmp/ci-report-page.html -w '%{http_code}' -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/finance/reports")
test "$report_page" = "200"

echo 'CI entering class routine checks'

# Dated routine: valid session, overlap rejection, atomic audit and terminal state.
anon_routine=$(curl -sS -o /tmp/ci-anon-routine.json -w '%{http_code}' "http://localhost:4173/api/staff/routine")
test "$anon_routine" = "401"
teacher_routine=$(curl -sS -o /tmp/ci-teacher-routine.json -w '%{http_code}' -b /tmp/teacher-ci-cookies "http://localhost:4173/api/staff/routine")
test "$teacher_routine" = "403"
routine_day=$(date -u +%F)
scheduled=$(curl -sS -o /tmp/ci-scheduled.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/staff/routine" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" --data "{\"batchId\":\"$admission_batch_id\",\"classOn\":\"$routine_day\",\"startsAt\":\"16:00\",\"endsAt\":\"17:00\",\"title\":\"Synthetic science lesson\",\"topic\":\"Chapter 1\",\"reason\":\"Plan a synthetic classroom session\"}")
echo "Routine schedule HTTP: $scheduled"
if [ "$scheduled" != "201" ]; then cat /tmp/ci-scheduled.json; fi
test "$scheduled" = "201"
session_id=$(node -e 'process.stdout.write(require("/tmp/ci-scheduled.json").id)')
overlap=$(curl -sS -o /tmp/ci-overlap.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/staff/routine" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" --data "{\"batchId\":\"$admission_batch_id\",\"classOn\":\"$routine_day\",\"startsAt\":\"16:30\",\"endsAt\":\"17:30\",\"title\":\"Overlapping science lesson\",\"topic\":\"Chapter 2\",\"reason\":\"Overlap must be rejected by D1\"}")
test "$overlap" = "409"
routine_held=$(curl -sS -o /tmp/ci-routine-held.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X PATCH "http://localhost:4173/api/staff/routine/$session_id" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" --data '{"expectedVersion":1,"nextStatus":"HELD","reason":"Classroom session took place in CI"}')
test "$routine_held" = "200"
routine_stale=$(curl -sS -o /tmp/ci-routine-stale.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X PATCH "http://localhost:4173/api/staff/routine/$session_id" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" --data '{"expectedVersion":1,"nextStatus":"CANCELLED","reason":"Cannot cancel a completed class"}')
test "$routine_stale" = "409"
routine_page=$(curl -sS -o /tmp/ci-routine-page.html -w '%{http_code}' -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/academics/routine")
test "$routine_page" = "200"
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state --sql "SELECT (SELECT COUNT(*) FROM academy_class_sessions WHERE status='HELD' AND version=2),(SELECT COUNT(*) FROM erp_audit_events WHERE entity_type='class_session')" > /tmp/ci-routine-count.json
node -e 'const x=require("/tmp/ci-routine-count.json")[0]?.results?.rows?.[0];if(x?.[0]!==1||x?.[1]!==2)process.exit(1);'

echo 'CI entering assessment and grading checks'

# Assessments: scores belong to active enrolments and lock on publish.
anon_assess=$(curl -sS -o /tmp/ci-anon-assess.json -w '%{http_code}' "http://localhost:4173/api/staff/assessments")
test "$anon_assess" = "401"
teacher_assess=$(curl -sS -o /tmp/ci-teacher-assess.json -w '%{http_code}' -b /tmp/teacher-ci-cookies "http://localhost:4173/api/staff/assessments")
test "$teacher_assess" = "403"
assessment_day=$(date -u +%F)
exam_create=$(curl -sS -o /tmp/ci-exam-create.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/staff/assessments" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" --data "{\"batchId\":\"$admission_batch_id\",\"title\":\"Synthetic monthly mathematics exam\",\"subject\":\"Mathematics\",\"heldOn\":\"$assessment_day\",\"maxMarks\":100,\"reason\":\"Create classroom performance test\"}")
echo "Assessment creation HTTP: $exam_create"
if [ "$exam_create" != "201" ]; then cat /tmp/ci-exam-create.json; fi
test "$exam_create" = "201"
exam_id=$(node -e 'process.stdout.write(require("/tmp/ci-exam-create.json").id)')
premature_publish=$(curl -sS -o /tmp/ci-premature-publish.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X PATCH "http://localhost:4173/api/staff/assessments/$exam_id" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" --data '{"expectedVersion":1,"reason":"Should reject an ungraded exam"}')
test "$premature_publish" = "409"
invalid_mark=$(curl -sS -o /tmp/ci-invalid-mark.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/staff/assessments/$exam_id/results" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" --data "{\"enrollmentId\":\"$attendance_enrollment_id\",\"marks\":120,\"expectedVersion\":0,\"reason\":\"Out of range marks are forbidden\"}")
test "$invalid_mark" = "409"
first_mark=$(curl -sS -o /tmp/ci-first-mark.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/staff/assessments/$exam_id/results" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" --data "{\"enrollmentId\":\"$attendance_enrollment_id\",\"marks\":82,\"expectedVersion\":0,\"reason\":\"Recorded verified examination marks\"}")
echo "Grade record HTTP: $first_mark"
if [ "$first_mark" != "200" ]; then cat /tmp/ci-first-mark.json; fi
test "$first_mark" = "200"
stale_mark=$(curl -sS -o /tmp/ci-stale-mark.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/staff/assessments/$exam_id/results" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" --data "{\"enrollmentId\":\"$attendance_enrollment_id\",\"marks\":60,\"expectedVersion\":0,\"reason\":\"Stale grade edit must fail\"}")
test "$stale_mark" = "409"
corrected_mark=$(curl -sS -o /tmp/ci-corrected-mark.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/staff/assessments/$exam_id/results" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" --data "{\"enrollmentId\":\"$attendance_enrollment_id\",\"marks\":86,\"expectedVersion\":1,\"reason\":\"Grade correction after answer review\"}")
test "$corrected_mark" = "200"
exam_publish=$(curl -sS -o /tmp/ci-exam-publish.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X PATCH "http://localhost:4173/api/staff/assessments/$exam_id" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" --data '{"expectedVersion":1,"reason":"All student marks checked and approved"}')
echo "Assessment publication HTTP: $exam_publish"
if [ "$exam_publish" != "200" ]; then cat /tmp/ci-exam-publish.json; fi
test "$exam_publish" = "200"
locked_mark=$(curl -sS -o /tmp/ci-locked-mark.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/staff/assessments/$exam_id/results" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" --data "{\"enrollmentId\":\"$attendance_enrollment_id\",\"marks\":90,\"expectedVersion\":2,\"reason\":\"Published results cannot be edited\"}")
test "$locked_mark" = "409"
exam_page=$(curl -sS -o /tmp/ci-exam-page.html -w '%{http_code}' -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/academics/assessments")
test "$exam_page" = "200"
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state --sql "SELECT (SELECT COUNT(*) FROM academy_assessments WHERE status='PUBLISHED' AND version=2),(SELECT COUNT(*) FROM academy_assessment_results WHERE obtained_marks=86 AND version=2),(SELECT COUNT(*) FROM erp_audit_events WHERE entity_type IN ('academy_assessment','academy_assessment_result'))" > /tmp/ci-assessments-verified.json
node -e 'const r=require("/tmp/ci-assessments-verified.json")[0]?.results?.rows?.[0];if(r?.[0]!==1||r?.[1]!==1||r?.[2]!==4)process.exit(1);'

echo 'CI entering dynamic subject catalogue checks'

# Dynamic subject mapping keeps public programme subject JSON in D1.
anon_subject=$(curl -sS -o /tmp/ci-anon-subject.json -w '%{http_code}' "http://localhost:4173/api/staff/subjects")
test "$anon_subject" = "401"
teacher_subject=$(curl -sS -o /tmp/ci-teacher-subject.json -w '%{http_code}' -b /tmp/teacher-ci-cookies -X POST "http://localhost:4173/api/staff/subjects" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" --data '{}')
test "$teacher_subject" = "403"
curl -fsS -b /tmp/staff-ci-cookies "http://localhost:4173/api/staff/subjects" > /tmp/ci-subject-baseline.json
node -e 'const d=require("/tmp/ci-subject-baseline.json");if(d.items.filter(x=>x.class_grade===10).length!==4||d.links.filter(x=>x.offering_id==="sa-ssc-science").length!==4)process.exit(1);'
# New grade-specific master creation is retired: the global academic_subjects
# directory is the only master writer. Test 410 and then create a synthetic
# *historical fixture directly in LOCAL disposable SQLite* solely to verify
# existing offering-subject linking still preserves its old IDs and public JSON.
legacy_create=$(curl -sS -o /tmp/ci-created-subject.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/staff/subjects" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" --data '{"code":"ENG","name":"English","classGrade":10,"group":"GENERAL","reason":"Should be created globally instead"}')
test "$legacy_create" = "410"
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state --sql "INSERT INTO academy_subjects(id,code,name,class_grade,group_name) VALUES('ci-legacy-subject','ENG','English',10,'GENERAL')" >/tmp/ci-local-legacy-subject.json
subject_id="ci-legacy-subject"
ssc_offering_version=$(node -e 'const d=require("/tmp/ci-subject-baseline.json");process.stdout.write(String(d.offerings.find(o=>o.id==="sa-ssc-science").version))')
subject_link=$(curl -sS -o /tmp/ci-subject-link.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/staff/subjects/assignment" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" --data "{\"offeringId\":\"sa-ssc-science\",\"subjectId\":\"$subject_id\",\"expectedOfferingVersion\":$ssc_offering_version,\"action\":\"ADD\",\"reason\":\"Offer the added English subject\"}")
echo "Subject assignment HTTP: $subject_link"
if [ "$subject_link" != "200" ]; then cat /tmp/ci-subject-link.json; fi
test "$subject_link" = "200"
stale_assignment=$(curl -sS -o /tmp/ci-stale-subject.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/staff/subjects/assignment" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" --data "{\"offeringId\":\"sa-ssc-science\",\"subjectId\":\"$subject_id\",\"expectedOfferingVersion\":$ssc_offering_version,\"action\":\"REMOVE\",\"reason\":\"A stale offering cannot be modified\"}")
test "$stale_assignment" = "409"
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state --sql "SELECT json_array_length(subjects_json) FROM public_programme_offerings WHERE id='sa-ssc-science'" > /tmp/ci-subject-five.json
node -e 'const n=require("/tmp/ci-subject-five.json")[0]?.results?.rows?.[0]?.[0];if(n!==5)process.exit(1);'
curl -fsS -b /tmp/staff-ci-cookies "http://localhost:4173/api/staff/subjects" > /tmp/ci-subject-after.json
updated_offering_version=$(node -e 'const d=require("/tmp/ci-subject-after.json");process.stdout.write(String(d.offerings.find(o=>o.id==="sa-ssc-science").version))')
subject_unlink=$(curl -sS -o /tmp/ci-subject-unlink.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/staff/subjects/assignment" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" --data "{\"offeringId\":\"sa-ssc-science\",\"subjectId\":\"$subject_id\",\"expectedOfferingVersion\":$updated_offering_version,\"action\":\"REMOVE\",\"reason\":\"Test reversible subject assignment\"}")
test "$subject_unlink" = "200"
subject_page=$(curl -sS -o /tmp/ci-subject-page.html -w '%{http_code}' -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/academics/subjects")
test "$subject_page" = "200"
grep -q "Subject Directory" /tmp/ci-subject-page.html
teacher_subject_page=$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' -b /tmp/teacher-ci-cookies "http://localhost:4173/dashboard/academics/subjects")
test "$teacher_subject_page" != "200"
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state --sql "SELECT (SELECT json_array_length(subjects_json) FROM public_programme_offerings WHERE id='sa-ssc-science'),(SELECT COUNT(*) FROM academy_subjects),(SELECT COUNT(*) FROM erp_audit_events WHERE entity_type IN ('academy_subject','offering_subject'))" > /tmp/ci-subject-final.json
node -e 'const x=require("/tmp/ci-subject-final.json")[0]?.results?.rows?.[0];if(x?.[0]!==4||x?.[1]!==5||x?.[2]!==2)process.exit(1);'

echo 'CI entering teacher class scoping checks'

# Teacher assignments: no classroom data without a matching active batch.
anonymous_teacher_classes=$(curl -sS -o /tmp/ci-anon-teacher-classes.json -w '%{http_code}' "http://localhost:4173/api/teacher/classes")
test "$anonymous_teacher_classes" = "401"
owner_as_teacher=$(curl -sS -o /tmp/ci-owner-as-teacher.json -w '%{http_code}' -b /tmp/staff-ci-cookies "http://localhost:4173/api/teacher/classes")
test "$owner_as_teacher" = "403"
teacher_before=$(curl -sS -o /tmp/ci-teacher-before.json -w '%{http_code}' -b /tmp/teacher-ci-cookies "http://localhost:4173/api/teacher/classes")
test "$teacher_before" = "200"
node -e 'const d=require("/tmp/ci-teacher-before.json");if(d.batches?.length!==0||d.students?.length!==0)process.exit(1);'
teacher_assignment_list=$(curl -sS -o /tmp/ci-teacher-assignment-list.json -w '%{http_code}' -b /tmp/staff-ci-cookies "http://localhost:4173/api/staff/teacher-assignments")
test "$teacher_assignment_list" = "200"
teacher_user_id=$(node -e 'const d=require("/tmp/ci-teacher-assignment-list.json");if(d.teachers?.length!==1)process.exit(1);process.stdout.write(d.teachers[0].user_id)')
teacher_cannot_assign=$(curl -sS -o /tmp/ci-teacher-cannot-assign.json -w '%{http_code}' -b /tmp/teacher-ci-cookies -X POST "http://localhost:4173/api/staff/teacher-assignments" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" --data '{}')
test "$teacher_cannot_assign" = "403"
teacher_assigned=$(curl -sS -o /tmp/ci-teacher-assigned.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/staff/teacher-assignments" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" --data "{\"teacherUserId\":\"$teacher_user_id\",\"batchId\":\"$admission_batch_id\",\"reason\":\"Assign verified synthetic teacher to CI batch\"}")
echo "Teacher assignment HTTP: $teacher_assigned"
if [ "$teacher_assigned" != "201" ]; then cat /tmp/ci-teacher-assigned.json; fi
test "$teacher_assigned" = "201"
teacher_assignment_id=$(node -e 'process.stdout.write(require("/tmp/ci-teacher-assigned.json").id)')
teacher_after=$(curl -sS -o /tmp/ci-teacher-after.json -w '%{http_code}' -b /tmp/teacher-ci-cookies "http://localhost:4173/api/teacher/classes")
test "$teacher_after" = "200"
node -e 'const d=require("/tmp/ci-teacher-after.json");if(d.batches?.length!==1||d.students?.length!==1||d.sessions?.length!==1||d.exams?.length!==1||JSON.stringify(d).includes("guardian_mobile"))process.exit(1);'
teacher_page=$(curl -sS -o /tmp/ci-teacher-page.html -w '%{http_code}' -b /tmp/teacher-ci-cookies "http://localhost:4173/dashboard/teacher")
test "$teacher_page" = "200"
teacher_revoke=$(curl -sS -o /tmp/ci-teacher-revoke.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X PATCH "http://localhost:4173/api/staff/teacher-assignments/$teacher_assignment_id" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" --data '{"active":false,"expectedVersion":1,"reason":"Revoke assigned classroom access in CI"}')
test "$teacher_revoke" = "200"
teacher_revoked=$(curl -sS -o /tmp/ci-teacher-revoked.json -w '%{http_code}' -b /tmp/teacher-ci-cookies "http://localhost:4173/api/teacher/classes")
test "$teacher_revoked" = "200"
node -e 'const d=require("/tmp/ci-teacher-revoked.json");if(d.batches?.length!==0||d.students?.length!==0)process.exit(1);'
teacher_stale_revoke=$(curl -sS -o /tmp/ci-teacher-stale-revoke.json -w '%{http_code}' -b /tmp/staff-ci-cookies -X PATCH "http://localhost:4173/api/staff/teacher-assignments/$teacher_assignment_id" -H "Origin: http://localhost:4173" -H "Content-Type: application/json" --data '{"active":false,"expectedVersion":1,"reason":"Stale assignment version must fail"}')
test "$teacher_stale_revoke" = "409"
teacher_assignment_page=$(curl -sS -o /tmp/ci-teacher-assignment-page.html -w '%{http_code}' -b /tmp/staff-ci-cookies "http://localhost:4173/dashboard/staff/teachers")
test "$teacher_assignment_page" = "200"
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state --sql "SELECT (SELECT COUNT(*) FROM academy_batch_teachers WHERE active=0 AND version=2),(SELECT COUNT(*) FROM erp_audit_events WHERE entity_type='teacher_assignment')" > /tmp/ci-teacher-verified.json
node -e 'const n=require("/tmp/ci-teacher-verified.json")[0]?.results?.rows?.[0];if(n?.[0]!==1||n?.[1]!==2)process.exit(1);'

# Exercise the original five-stage Admissions workflow against LOCAL D1.
# These are real authenticated API calls and accounting journal triggers,
# not snapshots or mocked server action responses.
echo 'CI testing five-stage original Admissions D1 workflow'
source_parity_id=$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')
source_parity_key=$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state --sql \
  "INSERT INTO academy_admissions(id,application_no,enquiry_id,offering_id,status,prepared_by,student_full_name,class_grade,guardian_full_name,guardian_mobile,school_name,batch_id)
   SELECT '$source_parity_id','CI-ADMISSION-'||substr('$source_parity_id',1,8),NULL,a.offering_id,'DRAFT',a.prepared_by,
   'Source Parity Student',a.class_grade,'Source Parity Guardian',a.guardian_mobile,a.school_name,a.batch_id
   FROM academy_admissions a WHERE a.id='$admission_id'" > /tmp/ci-source-new-admission.json
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state --sql \
  "INSERT INTO academy_admission_intake_details(admission_id,request_id,recorded_by,guardian_address)
   SELECT a.id,'$source_parity_key',a.prepared_by,'Verified full guardian address for local integration'
   FROM academy_admissions a WHERE a.id='$source_parity_id'" > /tmp/ci-source-new-details.json
workflow_endpoint="http://localhost:4173/api/staff/admissions/$source_parity_id/workflow"
anonymous_workflow=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$workflow_endpoint" \
  -H "Origin: http://localhost:4173" -H "Content-Type: application/json" \
  --data '{"action":"READY","reason":"Unauthorized admission attempt"}')
test "$anonymous_workflow" = "401"
teacher_workflow=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$workflow_endpoint" \
  -b /tmp/teacher-ci-cookies -H "Origin: http://localhost:4173" -H "Content-Type: application/json" \
  --data '{"action":"READY","reason":"Unauthorized teaching staff attempt"}')
test "$teacher_workflow" = "403"
workflow_call(){
  local label="$1"
  local body="$2"
  local status
  status=$(curl -sS -o /tmp/ci-admissions-workflow-result.json -w '%{http_code}' \
    -b /tmp/staff-ci-cookies -X POST "$workflow_endpoint" \
    -H "Origin: http://localhost:4173" -H "Content-Type: application/json" --data "$body")
  echo "Source Admissions $label HTTP $status"
  cat /tmp/ci-admissions-workflow-result.json
  echo
  test "$status" = "200"
  node -e 'const r=require("/tmp/ci-admissions-workflow-result.json");if(r.ok!==true){console.error("D1 workflow failed",r);process.exit(1)}'
}
premature=$(curl -sS -o /tmp/ci-admission-premature.json -w '%{http_code}' \
  -b /tmp/staff-ci-cookies -X POST "$workflow_endpoint" \
  -H "Origin: http://localhost:4173" -H "Content-Type: application/json" \
  --data '{"action":"FINALIZE","reason":"Premature final review should be rejected"}')
test "$premature" = "409"
workflow_call verified '{"action":"READY","reason":"Verified student identity, address, class and batch"}'
workflow_call source '{"action":"REFERRAL","source":"ORGANIC","reason":"Verified no referring person with guardian"}'
workflow_call consent '{"action":"CONSENT","guardianSignedOn":"2026-10-29","studentSigned":true,"physicalCopyReference":"Local CI paper file","reason":"Received signed original from guardian"}'
workflow_call charge '{"action":"EXTRA_CHARGE","chargeType":"MATERIAL","name":"Additional learning materials","amount":10,"reason":"Guardian approved one-time materials cost"}'
workflow_call discount '{"action":"DISCOUNT","discountPercent":0,"discountReason":"","reason":"Confirmed no tuition discount for case"}'
workflow_call final '{"action":"FINALIZE","reason":"Confirmed identity, placement, referral, signed paper and fees"}'
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state --sql \
  "SELECT a.status,s.student_no,i.amount_paisa,i.paid_paisa,
     (SELECT COUNT(*) FROM erp_audit_events e WHERE e.entity_id=a.id AND e.action='FINALIZED_AND_BILLED')
   FROM academy_admissions a JOIN academy_students s ON s.id=a.student_id
   JOIN finance_invoices i ON i.admission_id=a.id WHERE a.id='$source_parity_id'" \
  > /tmp/ci-finalized-admission.json
node -e 'const r=require("/tmp/ci-finalized-admission.json")[0]?.results?.rows?.[0];
  if(!r||r[0]!=="BILLED"||!/^SA-[0-9]{6,}$/.test(String(r[1]))||r[2]!==r[3]+r[2]||r[4]!==1){
   console.error("Finalized D1 admission incorrect",r);process.exit(1);
  }'
source_due=$(node -e 'const r=require("/tmp/ci-finalized-admission.json")[0].results.rows[0];process.stdout.write(String(r[2]/100))')
if [ "$source_due" != "0" ]; then
  unpaid_activate=$(curl -sS -o /tmp/ci-unpaid-activate.json -w '%{http_code}' \
    -b /tmp/staff-ci-cookies -X POST "$workflow_endpoint" \
    -H "Origin: http://localhost:4173" -H "Content-Type: application/json" \
    --data '{"action":"ACTIVATE","reason":"Unpaid admission activation must be refused"}')
  test "$unpaid_activate" = "409"
  legacy_unpaid_enroll=$(curl -sS -o /tmp/ci-legacy-unpaid-enroll.json -w '%{http_code}' \
    -b /tmp/staff-ci-cookies -X POST "http://localhost:4173/api/staff/admissions/$source_parity_id/enroll" \
    -H "Origin: http://localhost:4173" -H "Content-Type: application/json" \
    --data '{"expectedVersion":3,"reason":"Old route must not activate unpaid canonical admission"}')
  test "$legacy_unpaid_enroll" = "410"
  pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state --sql \
    "SELECT a.status,s.status,(SELECT COUNT(*) FROM academy_enrollments e WHERE e.admission_id=a.id)
     FROM academy_admissions a JOIN academy_students s ON s.id=a.student_id
     WHERE a.id='$source_parity_id'" > /tmp/ci-unpaid-inactive.json
  node -e 'const r=require("/tmp/ci-unpaid-inactive.json")[0]?.results?.rows?.[0];if(r?.[0]!=="BILLED"||r?.[1]!=="INACTIVE"||r?.[2]!==0)process.exit(1)'
  workflow_call payment "{\"action\":\"PAYMENT\",\"amount\":$source_due,\"method\":\"CASH\",\"reference\":\"Local CI payment\",\"reason\":\"Verified actual cash payment in synthetic local fixture\"}"
fi
workflow_call enroll '{"action":"ACTIVATE","reason":"Confirmed full invoice settlement and available cohort capacity"}'
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state --sql \
  "SELECT a.status,s.status,i.paid_paisa,i.amount_paisa,
     (SELECT COUNT(*) FROM academy_enrollments e WHERE e.admission_id=a.id AND e.status='ACTIVE'),
     (SELECT COUNT(*) FROM finance_journal_lines l JOIN finance_journals j ON j.id=l.journal_id
       WHERE j.reference LIKE 'INV:%' OR j.reference LIKE 'PAY:%')
   FROM academy_admissions a JOIN academy_students s ON s.id=a.student_id
   JOIN finance_invoices i ON i.admission_id=a.id WHERE a.id='$source_parity_id'" \
  > /tmp/ci-enrolled-parity.json
node -e 'const r=require("/tmp/ci-enrolled-parity.json")[0]?.results?.rows?.[0];
  if(!r||r[0]!=="ENROLLED"||r[1]!=="ACTIVE"||r[2]!==r[3]||r[4]!==1||r[5]<2){
   console.error("Original admission enrollment or GL posting failed",r);process.exit(1);
  }'
echo 'Original Admissions full D1 workflow verified with real ledger transactions.'

# Revoking a staff membership removes access even with a live
# Better Auth session cookie; do not rely on client-side role state.
pnpm exec cf d1 raw "$DB" --local --persist-to .cloudflare/state \
  --sql "UPDATE staff_memberships SET active=0 WHERE role='OWNER'" > /tmp/revoked.json
revoked_code=$(curl -sS -o /tmp/revoked-access.json -w '%{http_code}' \
  -b /tmp/staff-ci-cookies "http://localhost:4173/api/staff/prospects")
echo "revoked staff access HTTP: $revoked_code"
test "$revoked_code" = "401"
grep -q "SA-ENQ-" /tmp/sohojac-enquiry.json

# The CRM interoperability fixture was cleaned up; only the public smoke
# enquiry and deliberately unreconciled historical CLOSED fixture remain.
pnpm exec cf d1 raw "$DB" --sql "SELECT COUNT(*) AS n FROM public_enquiries" --local --persist-to .cloudflare/state >/tmp/enquiry-count.json
node -e 'const fs = require("node:fs"); const data = JSON.parse(fs.readFileSync("/tmp/enquiry-count.json", "utf8")); const count = data[0]?.results?.rows?.[0]?.[0]; if (count !== 2) { console.error("Expected public smoke + historical review fixture (2 enquiries); got", count); process.exit(1); } console.log("D1 write verified: public smoke plus historical review fixture");'

# An admission request must never be accepted while applications are closed.
admission_status=$(curl -sS -o /tmp/enquiry-closed.json -w '%{http_code}' -X POST "http://localhost:4173/api/enquiries" \
  -H "Content-Type: application/json" \
  --data '{"intent":"admission","offeringId":"sa-ssc-science","studentName":"Closed Test Student","className":"Class 10","guardianName":"Closed Test Guardian","mobile":"01700000001","subjectNames":[],"preferredSchedule":"","preferredDays":[],"trialInterest":false,"consent":true,"website":"","turnstileToken":""}')
echo "admission_status: $admission_status"
test "$admission_status" = "409"

# Regression: status notices come from the selected programme, not
# a stale server-side alert. All changes here are LOCAL test D1 only.
curl -fsS "http://localhost:4173/interest" > /tmp/interest-general.html
if grep -q "Applications are closed for the programme you selected" /tmp/interest-general.html; then
  echo "Unexpected closed-offering warning on general interest"; exit 1
fi
curl -fsS "http://localhost:4173/interest?intent=interest&offering=sa-ssc-science" > /tmp/interest-closed.html
grep -q "Applications are closed for this programme" /tmp/interest-closed.html
curl -fsS "http://localhost:4173/interest?intent=admission&offering=sa-ssc-science" > /tmp/admission-closed.html
grep -q "Applications are closed for the programme you selected" /tmp/admission-closed.html

# Simulate reopening one offering and verify the same deep link now
# reflects D1's current application status without a code change.
pnpm exec cf d1 raw "$DB" --sql "UPDATE public_programme_offerings SET is_accepting_applications=1, application_state='OPEN' WHERE id='sa-ssc-science'" --local --persist-to .cloudflare/state > /tmp/reopened-offering.json
curl -fsS "http://localhost:4173/interest?intent=interest&offering=sa-ssc-science" > /tmp/interest-open.html
grep -q "Applications are currently open for this programme" /tmp/interest-open.html
if grep -q "Applications are closed for this programme" /tmp/interest-open.html; then
  echo "Open programme still displays closed status"; exit 1
fi

# Invalid contact information and untrusted request origins must be rejected.
invalid_status=$(curl -sS -o /tmp/enquiry-invalid.json -w '%{http_code}' -X POST "http://localhost:4173/api/enquiries" \
  -H "Content-Type: application/json" \
  --data '{"intent":"interest","studentName":"A","className":"Class 8","guardianName":"Test Guardian","mobile":"123","consent":true}')
echo "invalid_status: $invalid_status"
test "$invalid_status" = "400"
origin_status=$(curl -sS -o /tmp/enquiry-origin.json -w '%{http_code}' -X POST "http://localhost:4173/api/enquiries" \
  -H "Origin: https://other.invalid" -H "Content-Type: application/json" --data '{}')
echo "origin_status: $origin_status"
test "$origin_status" = "403"
