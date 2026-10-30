# Sohojac development strategy

Updated: 30 October 2026. This is the single current roadmap and phase-status register.
Source parity: `sohoj-academy@f46b61611edce0a82f69e349bb89269329233b62`.
A deployed slice, a present file or green CI is not proof that the entire original ERP is complete.

## Product contract

- Preserve original operator workflows and visual structure; replace Supabase with Cloudflare D1/Workers.
- English-only dark ERP, canonical `/dashboard`, responsive desktop/mobile navigation.
- Staff-only accounts; no student/guardian login. Guardian communication is SMS, not email.
- Preserve permanent identities, historical ledgers and immutable published fee versions.
- One production D1; a separate isolated dev D1 contains no copied production records.
- Never seed invented students, payments, staff, branches or historical facts into production.

## Delivery rule

Finish one bounded phase, test it, commit it, merge to `dev`, verify the real isolated deployment,
then promote the frozen version to `master` and verify production. Update this register in each phase PR.
A phase may not be labelled released when its migration, Worker upload or health checks were skipped.
Record release evidence in the PR and GitHub Actions run; keep the current feature branch until the next phase.
Do not delete migrations, pinned source manifests or regression checks as cleanup.

| Phase | Outcome and acceptance | Status |
|---|---|---|
| 1 — Security foundation and repository hygiene | Turnstile on anonymous account forms; shared server verification; durable request limits on public/API/ERP mutations; challenge expiry/retry UI; production fail-closed checks; remove stale docs, sample endpoint and dead rollback/automatic cleanup workflow | Implemented; awaiting full integration CI and dev/production release verification |
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
  request hostname and configured auth origin to be loopback. Dev has real protection and needs
  its own allowed hostname and Turnstile credentials; no production security test bypass is provided.
- This is application request protection, not a claim that account-level Cloudflare WAF/Bot rules
  have been configured. Additional edge rules remain an infrastructure decision.
- Automated stale-branch pruning and the broken legacy public-only rollback workflow are removed.
  Essential build/regression, isolated dev deployment, production deployment and recovery capture stay.

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
- TypeScript and existing regression checks must pass before merging.
- Real integration and release evidence is recorded on the phase PR and Actions run.
- Human Turnstile completion in a real browser remains an explicit acceptance check.
