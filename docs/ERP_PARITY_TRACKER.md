# Sohoj Academy ERP parity tracker (2026-10-29)

Source of truth: `AbdusSattar-70/sohoj-academy`, branch
`feature/sohoj_final`. Destination: `AbdusSattar-70/sohojac`
using **Cloudflare D1 / Workers / Better Auth**. The old source uses
Supabase-specific actions, schema, RLS and RPC functions: copying those
files verbatim is unsafe and will not work. Each feature is ported with
the same operator workflow, a D1 data model and server-side permissions.

**Release rule (updated 2026-10-29):** master is the sole auto-deployment source, following a merged PR and passing integration CI. This code snapshot includes implemented but incomplete ERP work; a green CI run does not establish full feature parity or production acceptance. No demo data in live D1, no student/guardian login, staff UI English only.

## Functional parity — do not confuse schema with a finished module

| Legacy work area | D1/Better Auth target | Current state |
|---|---|---|
| Staff sign-in, owner, role checks | Better Auth + D1 | Live baseline |
| Access requests + review | Request form + audit + owner queue | Implemented on isolated branch, CI verification |
| Staff invitation, account activation | One-use hashed token + role membership | Implemented on isolated branch, CI verification |
| Password reset | Better Auth recovery + real staff email | UI and code staged; requires verified mail sender and delivery test |
| Account/profile, role management, MFA | Authorized staff lifecycle | Missing |
| Branches, academic years, classes/groups | Academic configuration screens, D1 persistence | D1 foundation only |
| Subjects, programmes, offerings, fee plans | Academic catalogue, public website projections | Subject/offering linkage and fee-plan management staged; dedicated programme template management pending |
| Batches, schedules, capacity | Academic offerings and batch register | Batch create/edit/lifecycle tested on isolated branch; timetable pending |
| CRM prospects, assignments, referral sources | CRM pipeline, staff follow-up | Prospect list/status/audit live; assignment/referral missing |
| Admissions, reviews, consent, print form | Draft → review → accept → bill → enroll | Draft → review → accept → bill → enroll and A4 consent form implemented on isolated branch; production checks pending |
| Students, enrollments, transfers, lifecycle | Verified records only after enrollment | Atomic enrollment and student register staged; transfers/lifecycle pending |
| Attendance, timetable, homework, exams | Classroom operations and assessments | Attendance, dated class routines and assessments/results staged with audit/security tests; homework and teacher assignment pending |
| Staff/teacher/workforce attendance & tasks | Workforce dashboard and assigned work | Scoped teacher batch assignments and read-only classroom staged; staff attendance and tasks missing |
| Payroll, compensation, referral rewards | Staff compensation controls | Missing |
| Finance GL/journals/accounting | Double-entry, immutable posted journals and reports | Initial invoices and collections use balanced GL; revenue recognition and full statements pending |
| Invoices, collections, receipts, allocations | Student receivables and reconciliations | Exact-price invoice, overpayment-guarded collection, audit and GL journal staged; further reconciliation pending |
| Discounts, refunds, purchases, suppliers, expenses | Finance operations and approvals | Posted operating expenses staged with GL and audit; approvals/refunds/purchasing pending |
| Inventory/stock/assets/cash handling | Operational ledgers and closing | Missing |
| Reporting, dashboard, audit logs, exports | Governed views and reliable summaries | Restricted audit history and cash/tuition/student operational reports staged; statutory reports and exports missing |
| Help, action center, setup guidance | Staff workflow guides and onboarding | Sidebar placeholder only |

Legacy groups inspected in the source tree:
`app/dashboard/academics`, `admissions`, `attendance`,
`crm`, `finance`, `governance`, `help`, `my-work`,
`referrals`, `settings`, `setup`, `staff`, `students`,
`teacher`, `action-center`, plus
`modules/finance/{accounting,assets,bank,capital,cash-flow,counters,daily-close,documents,handovers,operations,payroll,planning,procurement,purchases,receivables,recurring,reimbursements,reports,simple,stock,suppliers,year-end}`.

## Minimum acceptance checks for each feature

1. **Permissions:** anonymous requests and unauthorized roles rejected
   server-side; staff role revoke effective immediately.
2. **Data integrity:** no accidental enrollment, billing, password creation,
   revenue posting, or seat reservation. Multi-write operations atomic.
3. **Audit:** state-changing actions record actor, reason and timestamp.
4. **Bounded input:** Zod or equivalent input checks and parameterized SQL.
5. **User flow:** operator can finish the intended task, not just visit a page.
6. **CI:** type-check, build, D1 migration replay and authenticated integration
   checks pass on the feature commit.
7. **Release:** unrelated public-site routes remain functional.
8. **No mock feature claims:** inactive modules remain visibly unavailable
   until completed, then get functional sidebar links.

## Migration notes

- Migrations 0001–0004 establish the existing public and auth baseline.
- 0005 adds **empty** academic/student/admission/finance tables and staff
  access review records, plus cross-domain ERP audit records.
- 0006 adds a unique claim to secure invitation activation under concurrency.
- All migrations are additive. Never remove or rewrite a migration already
  applied in any production environment.
- The destination's `staff_memberships.role` currently allows OWNER,
  ADMIN, OPERATOR, TEACHER. ACCOUNTANT request collection can occur but its
  account activation remains blocked until the finance permissions
  architecture supports a least-privilege role.

## Production safeguard

Master is the sole production-deployment branch. The development branch `feature/erp_access_lifecycle` is not a deploy target. This consolidation was authorized as a full-code merge; pending feature parity and staff acceptance testing remain documented above. Prior deployed state is available in `feature/staff_crm_better_auth` and commit history; do not force-update production branches or rewrite applied D1 migrations.


## Exact-source migration work-in-progress (draft PR #13)

The live `master` implementation above is **not** the source-parity ERP. On
`refactor/original-erp-architecture-20261029`, we have now:

- Preserved original `ErpContext`, permission-linked routes and workspace
  navigation, plus source `ErpShell`, `ErpSidebar`, `ErpHeader`, account,
  workflow and page-render components. The sidebar primitive uses an existing
  React/Tailwind compatibility layer; exact visual parity needs acceptance.
- Added `/dashboard` and `/dashboard/account`; anonymous denial and owner
  rendering are verified against local D1.
- Added D1 user permission grants for named original ERP permissions.
  Owner routes are available; other staff roles require explicit grants.
- Removed the erroneous single-active-academic-year uniqueness index in a
  narrowly reviewed schema-only migration. Existing year records are intact.
- Restored the **original** Academic & Registration Settings page/form/schema,
  mapped to the existing D1 years, subjects and programmes with six new
  missing lookup tables. A D1 authorization-aware, reason-audited server
  action replaces the Supabase RPC. Page rendering and role denial passed CI;
  an authenticated full create/edit/reopen acceptance walkthrough is still
  required before calling the workspace fully verified.

**Release gate:** This draft PR is intentionally *not merged to master*.
Finance, admissions, workforce, teacher academics and other source workflows
are still incomplete; neither the old `/app` UI nor this preview is an
exact source-parity ERP. No production D1 migration has been applied by this PR.
