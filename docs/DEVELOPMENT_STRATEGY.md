# Sohojac development strategy

> **Architecture and UX redesign proposal (31 October 2026):** [Target modular architecture and phase gates](./ERP_TARGET_ARCHITECTURE.md) · [Operator-first pinpoint audit and workflow blueprint](./OPERATOR_FIRST_ERP_BLUEPRINT.md). Both are design proposals, **not deployed features**. Phase 2 financial/permission hardening remains the prerequisite; these documents do not replace verified phase statuses.

Updated: 31 October 2026. This is the single current roadmap and phase-status register.
Source parity: `sohoj-academy@f46b61611edce0a82f69e349bb89269329233b62`.
A deployed slice, a present file or green CI is not proof that the entire original ERP is complete.

## Product contract

- Preserve original operator workflows and visual structure; replace Supabase with Cloudflare D1/Workers.
- English-only dark ERP, canonical `/dashboard`, responsive desktop/mobile navigation.
- Staff-only accounts; no student/guardian login. Guardian communication is SMS, not email.
- Preserve permanent identities, historical ledgers and immutable published fee versions.
- **New owner decision (31 October 2026; supersedes the prior one-D1 deployment policy):** create a separate Cloudflare D1 database named exactly `sohojac_dev` for the `dev` branch and dev Worker. Keep production `master` deployed with the existing `sohojac` D1 and production Worker. No shared application data, staff login sessions, test receipts or migrations across environments.
- **Manual production promotion:** implement on a feature branch, merge into `dev`, deploy and verify against `sohojac_dev`. **Do not merge/push changes from `dev` into `master` until the owner has manually tested the deployed dev version and explicitly approved the particular release.** After approval, a reviewed PR may merge into `master` and trigger production CI/deployment against `sohojac`. Neither a green CI check nor a scheduled job constitutes owner's approval.
- **Transition status:** this is a required change to infrastructure/CI/application bindings, **not yet implemented** by these documentation edits. Current code still points both deployments to `sohojac` through `lib/database-target.ts`; treat dev as **not isolated until binding inspection and test evidence prove otherwise**.
- User decision (30 October 2026): reset development business data once and seed clean reference masters without TEST prefixes. Preserve login credentials and staff identities. Subsequent releases preserve newly entered work; never invent people, consent or financial history.

## Delivery rule

Finish one bounded phase, test it, commit it, merge to `dev`, deploy using **only `sohojac_dev`**, and verify the actual dev application and DB. Submit the dev URL, changed workflows, test cases and release notes for **manual owner acceptance**. Only after explicit owner approval of that version may a reviewed PR merge into `master`, triggering production deployment using **only `sohojac`**. Update this register in each phase PR. Never auto-merge dev to master or deploy dev commits to production.
A phase may not be labelled released when its migration, Worker upload or health checks were skipped.
Record release evidence in the PR and GitHub Actions run; keep the current feature branch until the next phase.
Do not delete migrations, pinned source manifests or regression checks as cleanup.

| Phase | Outcome and acceptance | Status |
|---|---|---|
| **0E — Environment isolation and owner-controlled promotion (new requirement)** | Provision `sohojac_dev`, bind `dev` Worker only to dev DB, preserve `master`→`sohojac`, separate auth/secrets/Turnstile/seeds/migrations/restore; verify DB ID and data isolation; require owner manual review and explicit approval before any dev→master merge | **Approved specification; implementation not started by this documentation PR. Blocks further remote dev write-testing and production promotion until verified.** |
| 1 — Security foundation and repository hygiene | Turnstile on anonymous forms; durable request limits; single shared sohojac D1; clean foundation reset and editable reference masters (Phase 1B); retire the old dev-only D1 after verified rebinding; consolidate docs and workflows | Implementation verified; environment release evidence is maintained in [phase PR #38](https://github.com/AbdusSattar-70/sohojac/pull/38) |
| 1B — Clean development foundation | One-time shared DB reset; Classes 1–12; guardian relationships and reference masters; consolidated Academic Setup; public options from active masters | Released and reset verified in [PR #41](https://github.com/AbdusSattar-70/sohojac/pull/41) |
| 1C — Academic setup workflow corrections | Single year editor; visible submission validation; consistent batch readiness; public Evening Care offerings and 12-seat cohorts | Released and verified in [PR #44](https://github.com/AbdusSattar-70/sohojac/pull/44) and [PR #46](https://github.com/AbdusSattar-70/sohojac/pull/46) |
| 2 — One authoritative write path | REST and Server Actions call the same domain commands; named permissions everywhere; retry-safe collections and expenses; retire bypass APIs; exact retry/concurrent/denial regression tests | Next |
| 3 — Canonical data and business rules | Reconcile the two subject masters without losing IDs; version-check master edits; common Asia/Dhaka business date and integer-paisa helpers; explicit fee-plan pinning policy | Planned |
| 4 — Engineering and operational reliability | Format/lint; split the long CI smoke script into maintainable suites without removing coverage; structured safe diagnostics; recovery drill and immutable rollback target; controlled dependency updates; remove proven unused dependencies | Planned |
| 5 — Workflow and UI consistency | Shared lifecycle/form primitives; pagination and full-ledger aggregates; accessible errors/loading/empty/conflict states; mobile/keyboard/print/browser tests | Planned |
| 6 — Original finance completion | Accounting, recurring billing, refunds/adjustments, payables, cash/bank/daily close and cost per student per month; preserve posted ledger history | Planned |
| 7 — Workforce and academics | Teacher compensation/payroll/referral incentives; planning/curriculum/sessions/results/progress; original workflows and scoped permissions | Planned |
| 8 — Acceptance and performance | End-to-end operator acceptance, role matrix, representative load, accessibility, restoration and production monitoring evidence | Planned |

## Deployed baseline before this phase

Master `aeb965f84db043eeaea0cda7c12221cecc0a66ce` released offerings/fee plans, academic
batches, receivables, student lifecycle and returning-student admission. This is a
verified deployment baseline, not a claim that the entire original ERP is migrated.

## Phase 1 scope and limits

Turnstile is bot verification; rate limiting bounds request frequency. Neither replaces authentication,
named permissions, transaction integrity or idempotency. The duplicate-payment and legacy-permission
findings remain open for Phase 2; security challenges do not fix them.

- Anonymous login, password recovery/reset, invitation acceptance and first-owner setup require an
  action/hostname-bound Turnstile token before their handler runs on deployed hosts.
- Public interest/admission and staff-access submissions retain challenges through the same verifier.
- Mutating API calls and Server Actions on every page (including `/dashboard`) share a bounded write quota. Routine authenticated
  saves do not present a CAPTCHA. Reads/navigation are not challenged by the application guard.
- D1 counters use atomic increments and bounded expiry cleanup. Only hashed IP/scope/window keys are
  stored; no raw address, email, password, token or session cookie is recorded in counters.
- Production cannot use local/CI headers to disable protection. Local bypass requires both actual
  request hostname and configured auth origin to be loopback. **Historical Phase 1 behavior** used shared data and accounts; the 31 October decision replaces it with independent `sohojac_dev` records, staff identities/secrets and an allowed dev hostname/Turnstile widget. No deployed security-test bypass is permitted.
- This is application request protection, not a claim that account-level Cloudflare WAF/Bot rules
  have been configured. Additional edge rules remain an infrastructure decision.
- Automated stale-branch pruning and the broken legacy public-only rollback workflow were removed.
  Essential build/regression and separate per-environment migration/recovery checks must stay. Do not leave a shared-D1 deployment workflow after separating the environments.

## Current review findings to close

1. Identical legacy collection requests can create two payments while balance remains (reproduced).
2. Role-only legacy APIs differ from named-permission domain actions.
3. Settings and offering subjects use separate masters (reproduced).
4. Legacy batch APIs enforce fewer prerequisites than canonical commands.
5. Master edits can overwrite concurrent changes; business dates mix UTC and Bangladesh time.
6. Lists have fixed caps; some billing summaries cover only returned rows (already disclosed in UI).
7. Whole-app browser/accessibility/load and recovery acceptance remain unproven.

## Phase-update checklist

Each PR states: scope; source-parity impact; files/workflows removed and why; migrations/data preservation;
security/permission implications; actual tests and their limits; dev and production release evidence;
remaining acceptance work. Update only the phase actually completed. Missing source pages and mappings
remain discoverable through the two pinned JSON manifests and the source-path audit script.

## Phase 1 verification log

- Nine direct production-guard tests cover policy routing, encoded paths, quota/reset behavior,
  server-action coverage, hashed keys, invalid/replayed/mismatched tokens and outages.
- TypeScript, Worker build and all 80 existing domain tests passed locally.
- Initial full integration CI passed in [Actions run 41085640537](https://github.com/AbdusSattar-70/sohojac/actions/runs/41085640537). Subsequent commits are rechecked before release.
- The phase PR is the current dev/production release record; its exact commit and migration/Worker/health evidence must be verified before calling the phase released.
- Human Turnstile completion in a real browser remains an explicit acceptance check.

## Separate dev and production databases — approved target, migration pending

The former single-D1 decision was used in the verified Phase 1 releases below. **It is superseded as of 31 October 2026.** The permanent target environment matrix is:

| Branch / environment | Cloudflare Worker | D1 database | Data and credentials | Promotion |
|---|---|---|---|---|
| `dev` / development | Separate dev Worker and hostname | **`sohojac_dev`** (must be created) | Separate dev staff identities, Better Auth origin/secret, Turnstile keys, test fixtures; safe to reset only with explicit dev authorization | Deploy to dev, test and manually review |
| `master` / production | Main Worker / `sohojac.com` | **`sohojac`** (retain existing DB and data) | Production identities, secrets and business records untouched | Owner explicitly approves the tested dev revision, then reviewed PR merges to `master` |

**Implementation gate (not done by this doc PR):** (1) provision exact D1 name `sohojac_dev` with its own real database ID, (2) configure dev Worker/CI D1 binding to that ID, production Worker/CI only to production ID, (3) independently apply versioned migrations and seed reference/approved synthetic data in dev, (4) configure separate auth origin, secrets and dev Turnstile hostname, (5) add fail-closed pre-deploy checks of branch → Worker → D1 ID/name and prohibit cross-environment DB usage, (6) run isolated CRUD/security/integration smoke tests on dev and confirm production row counts and worker binding unchanged, (7) enable the explicit manual approval gate before the master merge. **Until all checks pass, dev is still using the production database; do not use it for destructive testing.**

CI PR validation uses disposable local SQLite/D1 and does not migrate either remote database. Dev releases migrate/seed only `sohojac_dev`; master releases migrate **only `sohojac` after owner approval**. Keep individual recovery bookmarks, migration tracking, monitoring and secrets for each environment. Never clone guardian/student/payment PII from production into dev. Do not repeat the historical production reset or remove `sohojac` data.

Historical shared-D1 release evidence below remains accurate for the dates recorded; it does **not** describe the desired future architecture.

## Phase 1B: clean development foundation

The user explicitly requested a reset of the shared `sohojac` DB. Replace the former TEST seed with
`seeds/foundation.sql`: Classes 1–12, 27 editable guardian relationships (including Other), academic
years 2026/2027, groups, subjects, lead sources, programmes, Main Campus and the existing chart of accounts.
Do not fabricate schools, students, consent, offerings, batches, prices or financial transactions.
The subject list is a configurable starting point, not a claim of official curriculum coverage.
The legacy offering-subject register currently supports grades 4–12; extending its schema to grades 1–3
and reconciling the two subject registers remains Phase 3 work. Class masters and public interest support 1–12.

Main release runs the explicit one-time operation `foundation-reset-20261030-v1` only after a fresh recovery
bookmark and both Workers' maintenance support are verified. Preserve auth credentials, staff identities,
permission grants and migration history. Persist the original trigger manifest, block mutations, clear
business data, restore triggers, seed and validate foreign keys. A PREPARED operation blocks writes on failure;
retry using the saved manifest or restore the captured bookmark. COMPLETE prevents subsequent resets.
Dev releases no longer add TEST data. Academic years and academy identity belong to Academic Setup;
the dashboard link and duplicate sidebar grouping are corrected. Public choices read active reference masters.

Release evidence is recorded in PR #41 and the verified Actions runs. The reset completion result must be
confirmed independently of code checks; implementation alone is not proof of a remote reset.

### Phase 1B release evidence

- [PR integration run 41094528806](https://github.com/AbdusSattar-70/sohojac/actions/runs/41094528806) passed original source verifiers, migrations and authenticated smoke checks.
- [Dev run 41094908761](https://github.com/AbdusSattar-70/sohojac/actions/runs/41094908761) deployed commit `f378443beb6bb8d035da9ce29a944e76eafc5426` and applied maintenance migration 0035 successfully.
- [Main run 41095569753](https://github.com/AbdusSattar-70/sohojac/actions/runs/41095569753) deployed commit `6bc93c878466406009c8ca93364ad9f868159009`, captured the recovery bookmark, completed the shared D1 reset, and passed public health/private API denial and Turnstile checks.
- Public `/interest` HTML independently verified Classes 1–12, 27 guardian relationships and no TEST option labels after reset. Runtime validation confirmed zero students/payments and valid foreign keys before marking COMPLETE.
- Local verification: 15 reset/security/retirement checks, all 80 existing domain tests, TypeScript and Worker build passed. Login credentials and staff identities were preserved; no new login or financial posting was seeded.

## Phase 1C: academic setup workflow corrections

User-reported regressions: a duplicate Academic Years page, draft/non-fee-ready offerings selectable for
batch creation, and disabled offering submission buttons concealing validation requirements.

- Academic Setup is the single year-management UI. Remove the duplicate editor/navigation entry;
  retain old URLs as redirects and authenticated year APIs for compatibility.
- Share batch offering readiness between choices and guarded server mutations. Explain missing fee
  publication, exclude expired fees and inactive classes, and retain concurrency/capacity/idempotency checks.
- Keep offering, fee and public-control submit buttons available for validation; show summary/field errors,
  preserve input on failure, provide monthly due-day defaults and refresh request identities after success.
- Install a one-time additive public catalogue seed: Boys Evening Care for Classes 8–10, using the owner's
  stated ৳2,500/৳3,000 monthly fees, three current fee plans and three 12-seat batches. Seed no students,
  admissions, invoices or payments. Do not reset data or overwrite operator changes on later releases.
- Exercise the draft → fee publication → public controls → batch workflow and seed against the actual
  local Cloudflare D1 binding, in addition to existing SQLite/concurrency and authenticated CI checks.

Other programme prices remain operator decisions. Admission opens only through the normal verified workflow.
Record actual dev/main release evidence in the phase PR before marking this correction released.

### Phase 1C release evidence

- [PR #43](https://github.com/AbdusSattar-70/sohojac/pull/43) and [integration run 41101947580](https://github.com/AbdusSattar-70/sohojac/actions/runs/41101947580) verified the workflow corrections, actual local D1 binding, seed and authenticated ERP smoke checks. All original source/navigation verifiers, TypeScript and Worker build passed; 101 focused/domain tests passed locally.
- [Dev run 41103587472](https://github.com/AbdusSattar-70/sohojac/actions/runs/41103587472) deployed `34b7a908fd77bf9477b6ba63b616674b1f56cac1` and confirmed three public offerings, published fees and three 12-seat batches in the single shared D1. No students, admissions or payments were seeded.
- [Main run 41104267554](https://github.com/AbdusSattar-70/sohojac/actions/runs/41104267554) deployed `42e16ccdb77ba6b928a1cf18165c3ce0868fdb0b` and passed health, private endpoint denial and Turnstile checks. It confirmed the foundation reset and public catalogue seed were already complete, preserving subsequent work.
- Independent live HTML checks confirmed all three Evening Care cards on the homepage and offering choices in `/interest`, alongside Classes 1–12.
- Final review found a non-monthly due-day default edge case. [PR #45](https://github.com/AbdusSattar-70/sohojac/pull/45) added the shared monthly/term/one-time helper and regression coverage; [integration run 41104736381](https://github.com/AbdusSattar-70/sohojac/actions/runs/41104736381) passed. Monthly defaults to day 10; other billing cycles remain blank.
- [Final dev run 41105286069](https://github.com/AbdusSattar-70/sohojac/actions/runs/41105286069) deployed `6b59a376ed6c8e25002cbd7c2ed59fc2f62498b6`. [Final main run 41105806134](https://github.com/AbdusSattar-70/sohojac/actions/runs/41105806134) deployed `06c667c0c76cc412babf9db7917ab038d8211abd`, completing the correction phase with successful health/security checks.

Phase 2 remains next. Subject-master reconciliation and Classes 1–3 offering subjects remain Phase 3 work.

## Phase 1D: clear offering subjects and publication eligibility

Subject rows for different grades were shown with identical names/codes. Preserve their IDs and class/group
relationships, expose those labels, scope choices to the offering context and use searchable checkboxes.
Existing out-of-context links remain visible for explicit review/removal, rather than silent data loss.
Draft/retired publication controls explain their prerequisite beside the switches. Attempting a blocked
selection produces an immediate accessible alert and a link to the exact offering's Fee Plan or reactivation.
An intake flag on an inactive offering is shown as pending activation rather than misleadingly Open.
No database reset, deletions or fee changes are required. Record actual release evidence in the phase PR.
