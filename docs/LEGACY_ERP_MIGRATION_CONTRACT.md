# Sohoj Academy: architecture-preserving infrastructure migration

## Immutable reference
Source: `AbdusSattar-70/sohoj-academy`, branch `feature/sohoj_final`, commit `f46b61611edce0a82f69e349bb89269329233b62`.

The Cloudflare target must preserve the original **product**, routes,
`ErpShell`, page composition, `modules/**` action/query/schema/component
boundaries, workflow steps, permission names, guards, contextual help, reports,
printed forms, and staff user experience.

Allowed infrastructure substitutions: Supabase Auth → Better Auth,
Postgres/RLS/RPC → Cloudflare D1 with equivalent server authorization,
data integrity, audit and atomicity, Supabase Storage → R2, hosting →
Cloudflare Workers. Postgres and SQLite syntax differs; **behavior must not**.

Keep existing decisions: one D1 database, no student or guardian login,
staff interface English-only and dark-only, public bilingual site.

## Observed architecture gaps
* Original has **66** dashboard page components and **36**
  permission-bound navigation routes. The target's current `/app` pages
  are not source-equivalent `/dashboard` workspaces.
* Original has **255** `modules/**` files; target has **5**.
* Legacy context uses detailed permission strings and route-specific checks;
  target primarily uses OWNER / ADMIN / OPERATOR / TEACHER checks.
* Original academic master data permits several active years. Target
  `idx_one_active_academic_year` and UI allow only one: regression.
* Source finance (payroll, suppliers, inventory, procurement, bank, due
  follow-up, recurring, year-end and accounting), admission case review,
  class planning and sessions, workforce, referrals, governance and help
  are absent or materially simplified.

## Required sequence
1. Restore the original route registry, workspace navigation, `ErpShell`,
   permission vocabulary and `/dashboard/**` pages with source-equivalent UI.
   Adapt authentication under `modules/platform/auth` to Better Auth and D1.
2. Port original academic master data, CRM/offerings, admissions,
   consent/prints and student lifecycle using their existing module
   contracts. Fix year-status semantics via a reviewed **new** D1 migration;
   never edit applied migrations.
3. Port all source academics, teacher/workforce, referral, staff,
   finance, governance, help and action-centre modules in their original
   locations, with D1 implementations behind the same module API.
4. Compare each migrated page's fields, workflow transitions, validation,
   permission behavior, data integrity, audit and printed output to source.
   Run realistic authenticated D1 end-to-end regression tests.
5. Only then replace a live implementation. A successful build, isolated
   route, or similarly named page is not functional parity.

The four source files introduced with this draft PR are copied verbatim
as reference contracts, **not yet connected to production**. This draft
is not proof that the ERP is migrated. The current `/app` shell and
`lib/erp-*.ts` are interim implementations, not the target architecture.

## Implemented on migration branch (not yet production)
- Added `modules/platform/auth/erp-context.ts`: Better Auth verified staff
  session → D1 user-scoped permission grants → source `ErpContext`, with
  explicit denial and no public staff-account creation.
- Added D1 schema for user-scoped permissions; no automatic elevated grants.
- Added schema-only index correction for the original multi-active-year
  behavior; existing academic records are not deleted or rewritten.
- Added source-parity structural checks in CI.
- **Not complete:** The original `ErpShell`, page components, each domain's
  queries/actions and authenticated end-to-end workflow parity still need
  implementation and verification before replacing the live `/app` routes.

## Original dashboard preview on migration branch
- Imported original `ErpShell`, sidebar, header, signed-in account
  presentation, navigation and workflow-guide components from source.
- Added `/dashboard` and `/dashboard/account` backed by D1 and verified
  Better Auth identity; no separate account or database created.
- Missing original modules are excluded from active preview navigation;
  they are not silently represented as complete. Public website unchanged.
- A compatibility sidebar UI primitive adapts source shell to existing
  `@base-ui/react` UI stack without adding another component framework.
- CI tests both authenticated dashboard and anonymous denial.

## Academic & Registration Settings port (in draft)
- Source page `app/dashboard/academics/settings/page.tsx` and the original
  `modules/crm/manage/components/master-data-workspace.tsx` plus schema and
  form guides are restored.
- `modules/crm/manage/queries.ts` and `actions.ts` now use D1 directly and
  preserve authorizations/audited reason capture. Existing
  `academic_years`, `academic_subjects`, `academy_programmes` are
  canonical; `0023_academic_master_data.sql` only creates missing supporting
  reference entities.
- Authenticated screen rendering and teacher denial are tested on local D1.
  Source form mutation/reopen workflows still require end-to-end acceptance.
