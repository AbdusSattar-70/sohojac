# Source-first ERP migration — non-negotiable release contract

Original repository: AbdusSattar-70/sohoj-academy / feature/sohoj_final / f46b61611edce0a82f69e349bb89269329233b62
Target repository: AbdusSattar-70/sohojac (Cloudflare Workers, D1, R2; Better Auth)

**Requirement: migrate the entire original ERP application, not a new smaller ERP with similar functionality.**

## What must be preserved

- All original dashboard page routes and entire sidebar/header designs, components, interactive forms and responsive behavior.
- All original modules and separation of UI, schema, queries and actions. Do not replace original workflows with simplified reconstructions.
- Original staff identity, permanent numbers, staff lifecycle, roles, permissions, approval/audit system and branch assignments.
- CRM/prospects, admissions, physical consent, student registration, fee billing/payment/refunds, finance accounting/GL, procurement, payroll, reports, print layouts, teacher & academic operations, governance, referrals, help and settings.
- Exact approval transitions, validations, navigation, data visibility, feedback, and report output including single-A4 forms.

## What may change

- Supabase Auth -> Better Auth; preserve original staff/business identity and RBAC semantics.
- Postgres RLS, SQL and RPC -> Cloudflare D1+Workers authorization, transactions and equivalent audit.
- Supabase Storage -> R2; hosting and service configuration can change.
- Public site bilingual; staff ERP English; no guardian/student login.

## Full-release gates

1. Every original 65 dashboard page and 255 module file has an equivalent at its ORIGINAL route/path, adapting only infrastructure-specific pieces.
2. UI snapshot/interaction comparison against the pinned original source passes on every page.
3. Authenticated end-to-end positive/negative workflow tests, finance integrity and audit, print/export and role boundaries pass for all modules.
4. Original data, IDs and history are reconciled; never infer legacy staff numbers from names or silently overwrite records.
5. No 'final ERP complete' label or production cutover while any gate fails. Intermediate releases/previews must state the actual scope and stay reversible.

CI report: node scripts/audit-source-first-erp.mjs
Strict page/file gate: node scripts/audit-source-first-erp.mjs --strict

**Current target is incomplete**: this manifest measures the entire pinned original source. A green Worker build does not show feature/workflow parity.

## Implementation rule

Start from the ACTUAL original screen/component/module files. Preserve UI, route, schema semantics and workflow behavior; replace only Supabase adapters with D1/Workers/R2/Better Auth. Do not substitute a simplified new interface. Keep incomplete modules outside final acceptance.
