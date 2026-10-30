# Complete source ERP migration backlog

Audit date: 2026-10-30 (UTC). Source: [AbdusSattar-70/sohoj-academy@f46b61611edce0a82f69e349bb89269329233b62](https://github.com/AbdusSattar-70/sohoj-academy/tree/f46b61611edce0a82f69e349bb89269329233b62), branch `feature/sohoj_final`. Deployed baseline audited: [sohojac@ced2853a3a70e662602ca1005326e5aca38a298b](https://github.com/AbdusSattar-70/sohojac/tree/ced2853a3a70e662602ca1005326e5aca38a298b). The Git tree response was complete (`truncated=false`).

The goal is every original feature and workflow, implemented with Cloudflare Workers/D1, Better Auth and storage adapters. Preserve original operator flows, permissions, routes, accounting and print output. Reuse the pinned source screens and modules; replace infrastructure-specific code. The existing interim screens are useful deployed functionality, but do not establish original feature parity.

## Measured baseline

Counts were calculated by joining the source manifest's `path` and `blob` fields against the audited Git tree's `path` and `sha`. Presence and identical bytes are inventory evidence only: they do not establish runtime, authorization, historical-data or visual acceptance.

| Manifest category | Source paths | Present | Identical blob (E) | Changed/adapted (A) | Absent (M) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Dashboard pages | 66 | 25 | 12 | 13 | 41 |
| Domain/platform modules | 255 | 69 | 27 | 42 | 186 |
| ERP components | 22 | 20 | 8 | 12 | 2 |
| UI components | 23 | 14 | 6 | 8 | 9 |
| Source types | 4 | 1 | 1 | 0 | 3 |

All **38 Academics, 86 Finance, 9 Teacher, 14 Workforce, 8 Settings, 3 Referrals and 6 Student Lifecycle source module paths** are absent at this baseline. Interim APIs/components implement portions of these domains elsewhere. In particular, the deployed student billing overview is not the original Billing & Adjustments workspace.

Status legend for the inventories: **E** = original path with identical source Git blob; **A** = original path present with changed bytes, requiring adapter/UI/workflow review; **M** = original path absent. Every row still needs the applicable acceptance gates. A missing backend path may have a consolidated replacement; record and verify that mapping rather than assuming the underlying behavior is absent. Do not copy Supabase clients/RPCs merely to improve path counts.

The local admission-hardening and student-profile changes prepared after this baseline are **not included** in these production counts. Their source, tests, branch/PR, CI and deployment evidence must be recorded when released. In particular, the prepared read-only student profile is not full student lifecycle parity.

Source inventory: [source-first-erp-manifest.json](./source-first-erp-manifest.json). Existing audit commands after obtaining a complete checkout: `node scripts/audit-source-first-erp.mjs` and `node scripts/audit-source-first-erp.mjs --strict`. Supplement path checks with blob comparison and the functional acceptance below. The manifest also lists **61 source Supabase migrations**; map their constraints, RPC transitions, RLS and triggers to D1/Worker behavior. Their original SQL is not a D1 migration plan.

## Dependency-ordered feature releases

Complete each bounded feature on a `feature/<feature-name>` branch, run local and authenticated integration checks, deploy to isolated dev, then promote the verified commit through the existing production pipeline. Confirm the release job actually ran and check the resulting application. Keep unimplemented commands unavailable. Additive migrations must preserve existing IDs and applied migration history. Successful CI alone is not a declaration that the whole ERP is complete.

| Stage / proposed branch | Dependencies | Deliverable and concrete acceptance |
| --- | --- | --- |
| **S0** `feature/admissions-lifecycle-hardening`, then `feature/student-profile-history` | Current canonical admissions, D1 and staff auth | Retire legacy mutation paths that can bypass signed consent/payment; prevent fee-save/finalization races; verify no duplicate payments/students/invoices or false audit events. Complete staff and CRM intake browser actions, identity/placement corrections, return-to-draft/review, referral, consent, charges/discount, final billing, payment and paid-seat activation. Student detail reads only its canonical ID and independently gates admissions/finance history. Existing production core five-stage API flow is tested; source lifecycle concurrency and legacy bypass are remaining baseline gaps, with local fixes prepared. |
| **S1 — NEXT** `feature/academic-offerings-source-parity`, followed by `feature/academic-batches-source-parity` | S0; existing owner ERP context; verified branch/year/class/group/program/subject lookup mappings | Restore the original Programme Offerings register and all source forms, original batch register, lookup relationships, operation kinds, teaching dates, lifecycle, public controls/subjects and discount policy. Add versioned component-based fee plans with effective dates, billing cycles and due days; preserve already-issued bills and legacy non-UUID offering IDs. Accept create/edit/activate/retire, conflict/retry, published-vs-closed public intake, subject choices, authorized fee visibility and source admission price selection. Details below. |
| **S2** `feature/setup-access-governance-source-parity` | Existing staff identities; S1 catalogue references | Port setup/academy identity, policy control center, user/role/permission and branch assignments, access-request destination, account capabilities, governance rules and approvals. Test immediate revoke, least privilege, branch isolation, supported invitations/recovery, approval transitions and complete actor/reason history. Restore source command/read-error contracts with D1 equivalents. This gates configurable approvals and money/workforce operations in later stages. |
| **S3** `feature/academic-planning-timetable-source-parity` | S1 catalogue/batches; S2 permissions and configured policies | Restore curriculum/calendar/planning and timetable source workspaces. Test date boundaries, group/teacher/room conflicts, version/retry handling, publication and teaching-plan consistency; preserve original route and component structure. |
| **S4** `feature/workforce-teacher-classroom-source-parity` (split attendance, tasks and class sessions as separate reviewed releases) | S1 batches; S2 branch/staff permissions; S3 timetable | Restore workforce daily attendance/tasks/my-work, staff operations, teacher preparation/classroom/clock corrections/teaching report/student attendance, academic sessions/log review and homework. Existing assigned-class reads, attendance and dated routines are partial predecessors. Test assigned-only access, active enrollment, clock/correction rules, late edits, task ownership, session transitions and audit. Payroll reads remain gated until S10. |
| **S5** `feature/assessments-academic-documents-source-parity` | S3 teaching plan; S4 sessions, attendance and homework | Restore assessment/results commands and original questions/progress/report-print modules. Test marks ranges, lock/publish/reopen rules, unauthorized teacher/student access, correct class/student scope, source output and A4 print. Storage-dependent documents also require the storage blocker below. |
| **S6** `feature/finance-accounting-billing-source-parity` (split accounting, billing/adjustments and documents) | S0 admissions; S1 immutable fee versions; S2 finance permissions/approval rules | Port original finance entry, accounting, Billing & Adjustments/operations, payment forms and invoice print. Map original journal/line, allocation, discount/cancellation/refund and approval invariants to existing D1 ledgers before enabling each command. Accept exact integer money, balanced immutable posted journals, correct reversal rather than deletion, idempotence, independent billing/payment permissions and receipt/invoice ownership. Existing admission invoices, collection GL and operating expenses are partial baseline behavior, not the 86-module source Finance port. |
| **S7** `feature/student-lifecycle-receivables-recurring-source-parity` (separate student, receivables and recurring releases) | S1 fee versions; S2 policies; S6 invoice/adjustment/reversal adapters | Complete original student lifecycle forms/actions: identity/history, transfers, re-enrollment/merge/close-enrollment and resulting financial effects. Restore original Receivables and Recurring Billing workspaces/statements. Test period uniqueness, preview-versus-post agreement, late enrollment/proration/credit rules from source, no double bill, closed enrollment, transfer/merge history and governed write effects. Read-only profile work in S0 is an intermediate slice. |
| **S8** `feature/cash-bank-operations-source-parity` (counter, handover/close and bank releases) | S2 approval/role controls; S6 accounting and payments | Restore counters/history/transfers, handovers, daily close, bank import/reconciliation, capital and cash flow. Test custody ownership, transfer acknowledgement, count variances, locked closes, duplicate CSV/import detection, unmatched lines, balance reconciliation and approval/audit. |
| **S9** `feature/procurement-assets-stock-source-parity` (supplier/purchase, procurement, stock/assets releases) | S2 approvals; S6 accounting; S8 funding/cash/bank mappings | Restore suppliers/directory, procurement, purchases/adjustments, reimbursements, stock and assets. Test supplier identities, approval separation, receipt-vs-payment/return rules, quantities/valuation, immutable postings and document access. Preserve source procurement/purchase/stock relationships. |
| **S10** `feature/payroll-referrals-earnings-source-parity` (compensation, referrals and payroll releases) | S2 policy/branch roles; S4 verified workforce/teaching history; S6 accounting; S8 disbursement/reconciliation | Restore compensation/teaching earnings, personal finance, referral policy/rewards, payroll/recoveries and payroll print. Test calculation inputs, effective policies, reward eligibility, approval, recovery limits, repeat posting/payment, private self-view and audit; reconcile legacy staff/referrer identities. |
| **S11** `feature/finance-reporting-year-end-source-parity` (reports, budgets/planning and year-end releases) | S6–S10 posted ledgers; verified opening balances and source-data crosswalk | Restore original reports/statements, planning/budgets and year-end workflow. Test exact rollups, period/branch permissions, zero versus unavailable data, export/print, close/reopen restrictions and reconciled balances. Baseline operational reports are partial; they do not prove statutory/source report parity. |
| **S12** `feature/erp-full-workflow-acceptance` | All applicable stages and historical reconciliation | Finish dashboard metrics, Action Center, cross-domain search/navigation, remaining shared components, source Help/context links, governance audit correlation and CRM browser action acceptance. Exercise all 66 routes and 255 module contracts through their workflows; compare responsive source UI, print/export, authorization and historical totals. Record deployed feature evidence and unresolved differences; declare complete only when all gates pass. |

Historical export/crosswalk work starts alongside S0 and continues throughout these stages; it must not be postponed until financial reports or final cutover. Stages may be split into smaller branches, but dependent writes stay disabled until their prerequisites pass. The order is a delivery graph, not an instruction to merge unfinished unrelated modules together.

### Next feature: source Programme Offerings

Use the actual pinned `app/dashboard/academics/offerings/page.tsx` and `modules/offerings/components/{offering-register,offering-form,fee-plan-form,discount-policy-form,public-controls-form,showcase-form}.tsx`. Preserve its `academics.view`/`academics.manage`/`finance.view` distinction; the interim role-gated staff form is not its acceptance target.

Required backend work:

- Map organization/branch, operation kind, year, class/group/program, subject order, dates and DRAFT/ACTIVE/RETIRED state into existing D1 records; do not recreate the public offering catalogue.
- Preserve current immutable keys such as `sa-annual-2026` and `sa-ssc-science`; adapt UUID-only source validation where needed. Keep existing enquiries, batches and admissions linked.
- Replace `database-contract.ts`/Supabase RPC use with typed D1 queries and atomic audited commands, including guarded create/update, retry keys and lifecycle checks.
- Implement source fee-plan **versions and components** (`MONTHLY`/`ONE_TIME`/`TERM`, effective dates, monthly due day, component code/type/recurrence) and approved discounts. Existing flat mutable `academy_fee_plans` is insufficient for this claim. Add a compatible mapping for historical flat plans; never recompute posted invoices from a newer plan.
- Verify public visibility and application windows independently, subject choices and bilingual public copy, while staff screens remain English. Exercise the original row editing/public settings flows and finance visibility in browser tests.
- Restore original source batch UI as its own next slice using `modules/admissions/components/batch-register.tsx`; retain capacity and active-enrollment guards. Full timetable work follows in S3.

## Current behavior versus source paths

- Original Admissions register/print/application screens and core lifecycle exist. Missing source consent/referral/extra-charge file paths are partly implemented in the added `modules/admissions/lifecycle.ts`; certify and document those mappings or restore original module interfaces. The baseline still allows legacy API paths and fee races covered by S0.
- Original CRM, academic registration settings, Staff/Access, Audit and Help slices are implemented with D1 adapters; full branch/role and historical/action-level acceptance remains open. Byte-identical pages may invoke changed adapters.
- Present Academics offerings/batches/assessments/routine, Attendance, Teacher, Finance fee-plans/reports and Account routes contain interim wrappers/components rather than full original module workflows. Billing is a read-only invoice/receipt overview. All are recorded **A**, not finished source features.
- Existing source dashboard missing metrics remain unavailable rather than fabricated. Existing public website/interest registration behavior and private-route denial must keep passing throughout the migration.

## Acceptance and external dependencies

Every feature needs source-backed success, invalid-input, unauthorized/revoked-role, stale/conflicting-write and retry tests; atomic multi-table writes; actor/reason/timestamp audit; parameterized bounded queries; source UI/browser actions; correct route/error/navigation states; and applicable print/export/accounting checks. Run types, Worker build, D1 replay plus the authenticated integration suite on the exact feature commit. Promote through isolated dev and verify production health and actual staff workflows; a skipped release is not a deployment.

| Dependency / evidence still required | What it blocks | Concrete completion evidence |
| --- | --- | --- |
| Verified source Supabase exports and original staff/profile/role/branch, prospect/admission/student/referrer identities | Historical feature acceptance and full cutover; not independent implementation against local fixtures | Explicit reviewed source-to-D1 crosswalk preserving permanent IDs/numbers and relationships; duplicate/conflict report with staff decisions. Never infer identity from names/mobile/email alone. |
| Historical bills/payments/allocations/journals, cash/bank balances and period history | Finance statements, payroll/referral recovery, close/year-end and final historical parity | Reconciled row/amount/ledger counts, opening balances, immutable references, balanced journals and signed-off exceptions; no fabricated opening entries. |
| Signed-paper consent and source documents/files | Historical admission consent and source print/document acceptance | Source record/reference mapping, actual file/paper verification and audit, with missing records visibly unresolved. Do not set verified consent merely because a legacy boolean exists. |
| Storage destination and authorization | Original attachment/document persistence and migrated file access | Baseline `cloudflare.config.ts` has DB/assets/images but no R2 binding. Provision the intended storage, map source objects, enforce staff/branch access, validate checksums and retrieval; do not expose documents through public assets. |
| Mail sender/provider readiness | Real staff invitation/recovery delivery acceptance | Verified `STAFF_EMAIL_FROM` and configured provider secret, plus actual authorized delivery/one-use/expiry tests. Baseline code allows mail to be disabled; repository code does not establish current delivery readiness. |
| Source organization/branch identity and configurable policies | Correct branch-aware setup, permissions, approvals, discounts, referral/payroll rules | Verified academy identity/lookups and policy/effective-date mapping, least-privilege role matrix and acceptance by authorized staff. Do not invent defaults to fill missing production records. |
| Deployment/integration environment access and backup/restore evidence | Releasing each verified feature and final cutover | Exact branch SHA, green CI, successful isolated-dev and production release jobs, route/role smoke, reviewed additive migrations and a tested recovery path for relevant D1/file changes. Use existing configured credentials; do not request raw secrets in chat. |

No missing business records or credentials should be silently invented. Continue independent source implementation/tests while obtaining external evidence through the configured account or documented export workflow. Distinguish an unavailable external dependency from a code gap in each feature's release record.

## Complete dashboard route inventory

Paths are original source files; stage indicates the feature acceptance work that owns them. **E/A/M are baseline inventory statuses, not completion ticks.**

| Source page path | Baseline | Stage |
| --- | --- | --- |
| `app/dashboard/page.tsx` | E | S12 |
| `app/dashboard/academics/assessments/page.tsx` | A | S5 |
| `app/dashboard/academics/batches/page.tsx` | A | S1 |
| `app/dashboard/academics/curriculum/page.tsx` | M | S3 |
| `app/dashboard/academics/offerings/page.tsx` | A | S1 |
| `app/dashboard/academics/operations/page.tsx` | M | S4 |
| `app/dashboard/academics/planning/page.tsx` | M | S3 |
| `app/dashboard/academics/progress/[reportId]/print/page.tsx` | M | S5 |
| `app/dashboard/academics/progress/page.tsx` | M | S5 |
| `app/dashboard/academics/questions/page.tsx` | M | S5 |
| `app/dashboard/academics/routine/page.tsx` | A | S3 |
| `app/dashboard/academics/sessions/[sessionId]/page.tsx` | M | S4 |
| `app/dashboard/academics/settings/page.tsx` | E | S1 |
| `app/dashboard/account/page.tsx` | A | S2 |
| `app/dashboard/action-center/page.tsx` | M | S12 |
| `app/dashboard/admissions/[admissionId]/page.tsx` | A | S0 |
| `app/dashboard/admissions/[admissionId]/print/page.tsx` | E | S0 |
| `app/dashboard/admissions/application-form/page.tsx` | E | S0 |
| `app/dashboard/admissions/page.tsx` | E | S0 |
| `app/dashboard/attendance/page.tsx` | A | S4 |
| `app/dashboard/crm/manage/page.tsx` | E | S0 + S12 |
| `app/dashboard/crm/prospects/[prospectId]/page.tsx` | A | S0 + S12 |
| `app/dashboard/crm/prospects/page.tsx` | E | S0 + S12 |
| `app/dashboard/finance/accounting/page.tsx` | M | S6 |
| `app/dashboard/finance/assets/page.tsx` | M | S9 |
| `app/dashboard/finance/bank/page.tsx` | M | S8 |
| `app/dashboard/finance/billing/[invoiceId]/print/page.tsx` | M | S6 |
| `app/dashboard/finance/billing/page.tsx` | A | S6 |
| `app/dashboard/finance/capital/page.tsx` | M | S8 |
| `app/dashboard/finance/cash-flow/page.tsx` | M | S8 |
| `app/dashboard/finance/counters/page.tsx` | M | S8 |
| `app/dashboard/finance/daily-close/page.tsx` | M | S8 |
| `app/dashboard/finance/earnings/page.tsx` | M | S10 |
| `app/dashboard/finance/fee-plans/page.tsx` | A | S1 |
| `app/dashboard/finance/handovers/page.tsx` | M | S8 |
| `app/dashboard/finance/operations/page.tsx` | M | S6 |
| `app/dashboard/finance/page.tsx` | M | S6 |
| `app/dashboard/finance/payroll/[payrollId]/print/page.tsx` | M | S10 |
| `app/dashboard/finance/payroll/page.tsx` | M | S10 |
| `app/dashboard/finance/planning/page.tsx` | M | S11 |
| `app/dashboard/finance/procurement/page.tsx` | M | S9 |
| `app/dashboard/finance/purchases/page.tsx` | M | S9 |
| `app/dashboard/finance/receivables/[studentId]/print/page.tsx` | M | S7 |
| `app/dashboard/finance/receivables/page.tsx` | M | S7 |
| `app/dashboard/finance/recurring/page.tsx` | M | S7 |
| `app/dashboard/finance/reimbursements/page.tsx` | M | S9 |
| `app/dashboard/finance/reports/page.tsx` | A | S11 |
| `app/dashboard/finance/stock/page.tsx` | M | S9 |
| `app/dashboard/finance/suppliers/page.tsx` | M | S9 |
| `app/dashboard/finance/year-end/page.tsx` | M | S11 |
| `app/dashboard/governance/approvals/page.tsx` | M | S2 |
| `app/dashboard/governance/audit/page.tsx` | E | S12 |
| `app/dashboard/governance/rules/page.tsx` | M | S2 |
| `app/dashboard/help/academics/page.tsx` | E | S12 |
| `app/dashboard/help/finance/page.tsx` | E | S12 |
| `app/dashboard/help/page.tsx` | E | S12 |
| `app/dashboard/my-work/page.tsx` | M | S4 |
| `app/dashboard/referrals/page.tsx` | M | S10 |
| `app/dashboard/settings/access-requests/page.tsx` | M | S2 |
| `app/dashboard/settings/page.tsx` | M | S2 |
| `app/dashboard/setup/page.tsx` | M | S2 |
| `app/dashboard/staff/operations/page.tsx` | M | S4 |
| `app/dashboard/staff/page.tsx` | A | S4 |
| `app/dashboard/students/[studentId]/page.tsx` | M | S7 |
| `app/dashboard/students/page.tsx` | E | S7 |
| `app/dashboard/teacher/page.tsx` | A | S4 |

## Complete module inventory

Every one of the manifest's 255 source module paths appears below. Group totals are calculated from the same frozen baseline. **A** includes intentional infrastructure adapters as well as incomplete replacements; review behavior before changing or accepting either. **M** means the original path is absent, with consolidated equivalents noted above where known.

### modules/academics/assessments

0/4 paths present (0 E, 0 A, 4 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/academics/assessments/actions.ts` | M | S5 |
| `modules/academics/assessments/queries.ts` | M | S5 |
| `modules/academics/assessments/schema.ts` | M | S5 |
| `modules/academics/assessments/workspace.tsx` | M | S5 |

### modules/academics/documents

0/7 paths present (0 E, 0 A, 7 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/academics/documents/actions.ts` | M | S5 |
| `modules/academics/documents/form.tsx` | M | S5 |
| `modules/academics/documents/print-controls.tsx` | M | S5 |
| `modules/academics/documents/progress.tsx` | M | S5 |
| `modules/academics/documents/queries.ts` | M | S5 |
| `modules/academics/documents/questions.tsx` | M | S5 |
| `modules/academics/documents/schema.ts` | M | S5 |

### modules/academics/homework

0/4 paths present (0 E, 0 A, 4 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/academics/homework/actions.ts` | M | S4 |
| `modules/academics/homework/queries.ts` | M | S4 |
| `modules/academics/homework/schema.ts` | M | S4 |
| `modules/academics/homework/workspace.tsx` | M | S4 |

### modules/academics/operations

0/7 paths present (0 E, 0 A, 7 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/academics/operations/actions.ts` | M | S4 |
| `modules/academics/operations/class-log-form.tsx` | M | S4 |
| `modules/academics/operations/class-log-review.tsx` | M | S4 |
| `modules/academics/operations/command-form.tsx` | M | S4 |
| `modules/academics/operations/queries.ts` | M | S4 |
| `modules/academics/operations/schema.ts` | M | S4 |
| `modules/academics/operations/workspace.tsx` | M | S4 |

### modules/academics/planning

0/7 paths present (0 E, 0 A, 7 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/academics/planning/actions.ts` | M | S3 |
| `modules/academics/planning/calendar.tsx` | M | S3 |
| `modules/academics/planning/curriculum.tsx` | M | S3 |
| `modules/academics/planning/form.tsx` | M | S3 |
| `modules/academics/planning/queries.ts` | M | S3 |
| `modules/academics/planning/schema.ts` | M | S3 |
| `modules/academics/planning/workspace.tsx` | M | S3 |

### modules/academics/timetable

0/9 paths present (0 E, 0 A, 9 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/academics/timetable/actions.ts` | M | S3 |
| `modules/academics/timetable/dates.ts` | M | S3 |
| `modules/academics/timetable/editor.tsx` | M | S3 |
| `modules/academics/timetable/groups.ts` | M | S3 |
| `modules/academics/timetable/preview.tsx` | M | S3 |
| `modules/academics/timetable/rows.tsx` | M | S3 |
| `modules/academics/timetable/schema.ts` | M | S3 |
| `modules/academics/timetable/teaching-plan.tsx` | M | S3 |
| `modules/academics/timetable/workspace.tsx` | M | S3 |

### modules/action-center

0/1 paths present (0 E, 0 A, 1 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/action-center/queries.ts` | M | S12 |

### modules/admissions

22/28 paths present (5 E, 17 A, 6 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/admissions/actions.ts` | A | S0 |
| `modules/admissions/components/admission-paper.tsx` | E | S0 |
| `modules/admissions/components/batch-register.tsx` | M | S1 |
| `modules/admissions/components/case-step-navigation.tsx` | A | S0 |
| `modules/admissions/components/command-form.tsx` | A | S0 |
| `modules/admissions/components/directory-choice.tsx` | A | S0 |
| `modules/admissions/components/discount-form.tsx` | E | S0 |
| `modules/admissions/components/document-styles.ts` | E | S0 |
| `modules/admissions/components/extra-charge-form.tsx` | A | S0 |
| `modules/admissions/components/final-submission-review.tsx` | E | S0 |
| `modules/admissions/components/identity-editor.tsx` | A | S0 |
| `modules/admissions/components/physical-consent-form.tsx` | A | S0 |
| `modules/admissions/components/placement-editor.tsx` | E | S0 |
| `modules/admissions/components/print-button.tsx` | A | S0 |
| `modules/admissions/components/referral-form.tsx` | A | S0 |
| `modules/admissions/components/staff-intake-form.tsx` | A | S0 |
| `modules/admissions/consent-actions.ts` | M | S0 |
| `modules/admissions/consent.ts` | M | S0 |
| `modules/admissions/directory-actions.ts` | A | S0 |
| `modules/admissions/extra-charge-actions.ts` | M | S0 |
| `modules/admissions/intake-actions.ts` | A | S0 |
| `modules/admissions/intake-schema.ts` | A | S0 |
| `modules/admissions/print-catalogue.ts` | A | S0 |
| `modules/admissions/queries.ts` | A | S0 |
| `modules/admissions/referral-actions.ts` | M | S0 |
| `modules/admissions/referrals.ts` | M | S0 |
| `modules/admissions/review-actions.ts` | A | S0 |
| `modules/admissions/schema.ts` | A | S0 |

### modules/crm

13/13 paths present (6 E, 7 A, 0 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/crm/actions.ts` | A | S12 |
| `modules/crm/assignment-actions.ts` | A | S12 |
| `modules/crm/components/prospect-assignment-form.tsx` | E | S12 |
| `modules/crm/components/prospect-followup-form.tsx` | E | S12 |
| `modules/crm/components/prospect-table.tsx` | E | S12 |
| `modules/crm/manage/actions.ts` | A | S12 |
| `modules/crm/manage/components/master-data-workspace.tsx` | A | S12 |
| `modules/crm/manage/queries.ts` | A | S12 |
| `modules/crm/manage/schema.ts` | E | S12 |
| `modules/crm/prospect-status.ts` | E | S12 |
| `modules/crm/queries.ts` | A | S12 |
| `modules/crm/schema.ts` | E | S12 |
| `modules/crm/website/workspace.tsx` | A | S12 |

### modules/dashboard

1/1 paths present (0 E, 1 A, 0 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/dashboard/queries.ts` | A | S12 |

### modules/finance/accounting

0/3 paths present (0 E, 0 A, 3 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/finance/accounting/actions.ts` | M | S6 |
| `modules/finance/accounting/queries.ts` | M | S6 |
| `modules/finance/accounting/workspace.tsx` | M | S6 |

### modules/finance/assets

0/3 paths present (0 E, 0 A, 3 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/finance/assets/actions.ts` | M | S9 |
| `modules/finance/assets/queries.ts` | M | S9 |
| `modules/finance/assets/register.tsx` | M | S9 |

### modules/finance/bank

0/4 paths present (0 E, 0 A, 4 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/finance/bank/actions.ts` | M | S8 |
| `modules/finance/bank/csv.ts` | M | S8 |
| `modules/finance/bank/queries.ts` | M | S8 |
| `modules/finance/bank/register.tsx` | M | S8 |

### modules/finance/capital

0/3 paths present (0 E, 0 A, 3 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/finance/capital/actions.ts` | M | S8 |
| `modules/finance/capital/queries.ts` | M | S8 |
| `modules/finance/capital/register.tsx` | M | S8 |

### modules/finance/cash-flow

0/3 paths present (0 E, 0 A, 3 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/finance/cash-flow/actions.ts` | M | S8 |
| `modules/finance/cash-flow/queries.ts` | M | S8 |
| `modules/finance/cash-flow/register.tsx` | M | S8 |

### modules/finance/counters

0/9 paths present (0 E, 0 A, 9 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/finance/counters/actions.ts` | M | S8 |
| `modules/finance/counters/history-actions.ts` | M | S8 |
| `modules/finance/counters/history-panel.tsx` | M | S8 |
| `modules/finance/counters/history-schema.ts` | M | S8 |
| `modules/finance/counters/queries.ts` | M | S8 |
| `modules/finance/counters/register.tsx` | M | S8 |
| `modules/finance/counters/transfer-actions.ts` | M | S8 |
| `modules/finance/counters/transfer-queries.ts` | M | S8 |
| `modules/finance/counters/workspace.tsx` | M | S8 |

### modules/finance/daily-close

0/3 paths present (0 E, 0 A, 3 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/finance/daily-close/actions.ts` | M | S8 |
| `modules/finance/daily-close/queries.ts` | M | S8 |
| `modules/finance/daily-close/register.tsx` | M | S8 |

### modules/finance/documents

0/1 paths present (0 E, 0 A, 1 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/finance/documents/panel.tsx` | M | S6 |

### modules/finance/handovers

0/3 paths present (0 E, 0 A, 3 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/finance/handovers/actions.ts` | M | S8 |
| `modules/finance/handovers/queries.ts` | M | S8 |
| `modules/finance/handovers/register.tsx` | M | S8 |

### modules/finance/inline-operation.tsx

0/1 paths present (0 E, 0 A, 1 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/finance/inline-operation.tsx` | M | S6 |

### modules/finance/operations

0/8 paths present (0 E, 0 A, 8 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/finance/operations/actions.ts` | M | S6 |
| `modules/finance/operations/collection-actions.ts` | M | S6 |
| `modules/finance/operations/collection-form.tsx` | M | S6 |
| `modules/finance/operations/command-form.tsx` | M | S6 |
| `modules/finance/operations/queries.ts` | M | S6 |
| `modules/finance/operations/recurring-billing.tsx` | M | S7 |
| `modules/finance/operations/schema.ts` | M | S6 |
| `modules/finance/operations/workspace.tsx` | M | S6 |

### modules/finance/payroll

0/6 paths present (0 E, 0 A, 6 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/finance/payroll/actions.ts` | M | S10 |
| `modules/finance/payroll/personal-summary.tsx` | M | S10 |
| `modules/finance/payroll/queries.ts` | M | S10 |
| `modules/finance/payroll/recovery-actions.ts` | M | S10 |
| `modules/finance/payroll/recovery-panel.tsx` | M | S10 |
| `modules/finance/payroll/register.tsx` | M | S10 |

### modules/finance/planning

0/3 paths present (0 E, 0 A, 3 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/finance/planning/actions.ts` | M | S11 |
| `modules/finance/planning/queries.ts` | M | S11 |
| `modules/finance/planning/register.tsx` | M | S11 |

### modules/finance/procurement

0/3 paths present (0 E, 0 A, 3 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/finance/procurement/actions.ts` | M | S9 |
| `modules/finance/procurement/queries.ts` | M | S9 |
| `modules/finance/procurement/register.tsx` | M | S9 |

### modules/finance/purchases

0/8 paths present (0 E, 0 A, 8 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/finance/purchases/actions.ts` | M | S9 |
| `modules/finance/purchases/adjustment-actions.ts` | M | S9 |
| `modules/finance/purchases/adjustments.tsx` | M | S9 |
| `modules/finance/purchases/directory-actions.ts` | M | S9 |
| `modules/finance/purchases/directory-queries.ts` | M | S9 |
| `modules/finance/purchases/directory.tsx` | M | S9 |
| `modules/finance/purchases/queries.ts` | M | S9 |
| `modules/finance/purchases/register.tsx` | M | S9 |

### modules/finance/receivables

0/3 paths present (0 E, 0 A, 3 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/finance/receivables/actions.ts` | M | S7 |
| `modules/finance/receivables/queries.ts` | M | S7 |
| `modules/finance/receivables/register.tsx` | M | S7 |

### modules/finance/recurring

0/3 paths present (0 E, 0 A, 3 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/finance/recurring/actions.ts` | M | S7 |
| `modules/finance/recurring/queries.ts` | M | S7 |
| `modules/finance/recurring/register.tsx` | M | S7 |

### modules/finance/reimbursements

0/3 paths present (0 E, 0 A, 3 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/finance/reimbursements/actions.ts` | M | S9 |
| `modules/finance/reimbursements/queries.ts` | M | S9 |
| `modules/finance/reimbursements/register.tsx` | M | S9 |

### modules/finance/reports

0/3 paths present (0 E, 0 A, 3 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/finance/reports/actions.ts` | M | S11 |
| `modules/finance/reports/queries.ts` | M | S11 |
| `modules/finance/reports/workspace.tsx` | M | S11 |

### modules/finance/simple

0/5 paths present (0 E, 0 A, 5 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/finance/simple/actions.ts` | M | S10 |
| `modules/finance/simple/queries.ts` | M | S10 |
| `modules/finance/simple/teaching-queries.ts` | M | S10 |
| `modules/finance/simple/teaching-workspace.tsx` | M | S10 |
| `modules/finance/simple/workspace.tsx` | M | S10 |

### modules/finance/stock

0/3 paths present (0 E, 0 A, 3 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/finance/stock/actions.ts` | M | S9 |
| `modules/finance/stock/queries.ts` | M | S9 |
| `modules/finance/stock/register.tsx` | M | S9 |

### modules/finance/suppliers

0/2 paths present (0 E, 0 A, 2 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/finance/suppliers/queries.ts` | M | S9 |
| `modules/finance/suppliers/register.tsx` | M | S9 |

### modules/finance/year-end

0/3 paths present (0 E, 0 A, 3 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/finance/year-end/actions.ts` | M | S11 |
| `modules/finance/year-end/queries.ts` | M | S11 |
| `modules/finance/year-end/register.tsx` | M | S11 |

### modules/governance

2/2 paths present (0 E, 2 A, 0 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/governance/audit-view.tsx` | A | S12 |
| `modules/governance/queries.ts` | A | S12 |

### modules/help

5/5 paths present (5 E, 0 A, 0 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/help/admission-steps.ts` | E | S12 |
| `modules/help/daily-steps.ts` | E | S12 |
| `modules/help/finance-guide.bn.json` | E | S12 |
| `modules/help/setup-steps.ts` | E | S12 |
| `modules/help/workflow-guide.tsx` | E | S12 |

### modules/home

3/3 paths present (3 E, 0 A, 0 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/home/page-content.tsx` | E | S12 |
| `modules/home/program-section.tsx` | E | S12 |
| `modules/home/public-page-shell.tsx` | E | S12 |

### modules/offerings

4/11 paths present (1 E, 3 A, 7 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/offerings/actions.ts` | A | S1 |
| `modules/offerings/components/discount-policy-form.tsx` | M | S1 |
| `modules/offerings/components/fee-plan-form.tsx` | M | S1 |
| `modules/offerings/components/offering-form.tsx` | M | S1 |
| `modules/offerings/components/offering-register.tsx` | M | S1 |
| `modules/offerings/components/public-controls-form.tsx` | E | S1 |
| `modules/offerings/components/showcase-form.tsx` | M | S1 |
| `modules/offerings/database-contract.ts` | M | S1 |
| `modules/offerings/discount-actions.ts` | M | S1 |
| `modules/offerings/queries.ts` | A | S1 |
| `modules/offerings/schema.ts` | A | S1 |

### modules/platform

15/23 paths present (7 E, 8 A, 8 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/platform/access/actions.ts` | A | S2 |
| `modules/platform/access/request-form.tsx` | M | S2 |
| `modules/platform/access/request-register.tsx` | A | S2 |
| `modules/platform/auth/erp-context.ts` | A | S2 |
| `modules/platform/command-action.ts` | M | S2 |
| `modules/platform/lifecycle-actions.ts` | A | S2 |
| `modules/platform/navigation/erp-navigation.ts` | A | S12 |
| `modules/platform/navigation/erp-route-registry.ts` | A | S12 |
| `modules/platform/navigation/feedback-message.ts` | E | S12 |
| `modules/platform/navigation/field-guides.ts` | E | S12 |
| `modules/platform/navigation/field-labels.ts` | E | S12 |
| `modules/platform/navigation/navigation-guard.ts` | E | S12 |
| `modules/platform/navigation/workflow-guides.ts` | E | S12 |
| `modules/platform/navigation/workflow-return.ts` | E | S12 |
| `modules/platform/navigation/workspace-navigation.ts` | E | S12 |
| `modules/platform/read-availability.ts` | M | S2 |
| `modules/platform/rpc-client.ts` | M | S2 |
| `modules/platform/search/actions.ts` | A | S12 |
| `modules/platform/setup/actions.ts` | M | S2 |
| `modules/platform/setup/complete-button.tsx` | M | S2 |
| `modules/platform/setup/identity-actions.ts` | M | S2 |
| `modules/platform/setup/identity-form.tsx` | M | S2 |
| `modules/platform/setup/queries.ts` | A | S2 |

### modules/referrals

0/3 paths present (0 E, 0 A, 3 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/referrals/actions.ts` | M | S10 |
| `modules/referrals/queries.ts` | M | S10 |
| `modules/referrals/register.tsx` | M | S10 |

### modules/settings

0/8 paths present (0 E, 0 A, 8 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/settings/actions.ts` | M | S2 |
| `modules/settings/components/policy-control-center.tsx` | M | S2 |
| `modules/settings/components/referral-policy-editor.tsx` | M | S2 |
| `modules/settings/components/role-permission-editor.tsx` | M | S2 |
| `modules/settings/components/user-access-editor.tsx` | M | S2 |
| `modules/settings/queries.ts` | M | S2 |
| `modules/settings/referral-policy-actions.ts` | M | S2 |
| `modules/settings/schema.ts` | M | S2 |

### modules/staff

3/3 paths present (0 E, 3 A, 0 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/staff/components/staff-register.tsx` | A | S4 |
| `modules/staff/edit-actions.ts` | A | S4 |
| `modules/staff/queries.ts` | A | S4 |

### modules/students

1/7 paths present (0 E, 1 A, 6 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/students/lifecycle/actions.ts` | M | S7 |
| `modules/students/lifecycle/close-actions.ts` | M | S7 |
| `modules/students/lifecycle/close-enrollment-form.tsx` | M | S7 |
| `modules/students/lifecycle/command-form.tsx` | M | S7 |
| `modules/students/lifecycle/queries.ts` | M | S7 |
| `modules/students/lifecycle/schema.ts` | M | S7 |
| `modules/students/queries.ts` | A | S7 |

### modules/teacher

0/9 paths present (0 E, 0 A, 9 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/teacher/classroom/actions.ts` | M | S4 |
| `modules/teacher/classroom/clock-correction.tsx` | M | S4 |
| `modules/teacher/classroom/preparation.tsx` | M | S4 |
| `modules/teacher/classroom/queries.ts` | M | S4 |
| `modules/teacher/classroom/schema.ts` | M | S4 |
| `modules/teacher/classroom/student-attendance.tsx` | M | S4 |
| `modules/teacher/classroom/teaching-report.tsx` | M | S4 |
| `modules/teacher/classroom/workspace.tsx` | M | S4 |
| `modules/teacher/workspace.tsx` | M | S4 |

### modules/workforce

0/14 paths present (0 E, 0 A, 14 M).

| Source module path | Baseline | Stage |
| --- | --- | --- |
| `modules/workforce/actions.ts` | M | S4 |
| `modules/workforce/attendance-register-query.ts` | M | S4 |
| `modules/workforce/attendance-register.tsx` | M | S4 |
| `modules/workforce/daily-attendance-actions.ts` | M | S4 |
| `modules/workforce/daily-attendance-form.tsx` | M | S4 |
| `modules/workforce/daily-attendance.ts` | M | S4 |
| `modules/workforce/personal-finance.tsx` | M | S10 |
| `modules/workforce/queries.ts` | M | S4 |
| `modules/workforce/route-query.ts` | M | S4 |
| `modules/workforce/task-actions.ts` | M | S4 |
| `modules/workforce/task-register.tsx` | M | S4 |
| `modules/workforce/tasks.ts` | M | S4 |
| `modules/workforce/work-tabs.tsx` | M | S4 |
| `modules/workforce/workspace.tsx` | M | S4 |

## Shared components and type interfaces

Complete these with their consuming features and finish source interaction/visual acceptance in S12. Backend-specific types and Supabase/RPC helpers need D1/Better Auth equivalents, not nonworking compatibility stubs. Preserve intentional, accepted accessibility/responsive improvements when comparing source behavior.

| Original support path | Baseline |
| --- | --- |
| `components/erp/action-panel.tsx` | E |
| `components/erp/central-search.tsx` | A |
| `components/erp/empty-state.tsx` | E |
| `components/erp/erp-account.tsx` | A |
| `components/erp/erp-header.tsx` | A |
| `components/erp/erp-shell.tsx` | A |
| `components/erp/erp-sidebar.tsx` | A |
| `components/erp/form-field.tsx` | A |
| `components/erp/help-disclosure.tsx` | A |
| `components/erp/inline-work-panel.tsx` | M |
| `components/erp/mutation-feedback.tsx` | A |
| `components/erp/overview-return-link.tsx` | A |
| `components/erp/page-header.tsx` | E |
| `components/erp/page-workflow-guide.tsx` | A |
| `components/erp/record-state-button.tsx` | E |
| `components/erp/retry-read.tsx` | M |
| `components/erp/staff-edit-button.tsx` | E |
| `components/erp/stat-card.tsx` | E |
| `components/erp/status-badge.tsx` | E |
| `components/erp/workflow-guide.tsx` | E |
| `components/erp/workflow-return.tsx` | A |
| `components/erp/workspace-form-safety.tsx` | A |
| `components/ui/alert-dialog.tsx` | M |
| `components/ui/avatar.tsx` | M |
| `components/ui/badge.tsx` | E |
| `components/ui/breadcrumb.tsx` | M |
| `components/ui/button.tsx` | A |
| `components/ui/card.tsx` | A |
| `components/ui/checkbox.tsx` | E |
| `components/ui/collapsible.tsx` | M |
| `components/ui/dialog.tsx` | A |
| `components/ui/dropdown-menu.tsx` | M |
| `components/ui/input.tsx` | A |
| `components/ui/label.tsx` | A |
| `components/ui/navigation-menu.tsx` | M |
| `components/ui/select.tsx` | E |
| `components/ui/separator.tsx` | A |
| `components/ui/sheet.tsx` | M |
| `components/ui/sidebar.tsx` | A |
| `components/ui/skeleton.tsx` | A |
| `components/ui/table.tsx` | E |
| `components/ui/tabs.tsx` | E |
| `components/ui/textarea.tsx` | E |
| `components/ui/toast.tsx` | M |
| `components/ui/tooltip.tsx` | M |
| `types/database.ts` | M |
| `types/erp.ts` | E |
| `types/index.ts` | M |
| `types/user.ts` | M |

## Completion ledger to maintain with each release

For each stage/slice, record source routes/modules, equivalent D1 schema/permission/command mappings, precise feature commit, automated/browser acceptance evidence, historical reconciliation status, dev/production deployment URLs and SHA, and any remaining unsupported commands. Recompute the inventory against that deployed SHA. Do not mark an entire module family complete because its landing page renders or a source file was copied.

