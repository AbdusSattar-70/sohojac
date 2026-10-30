# Sohojac — development strategy and verified delivery status

Updated: **31 October 2026**. This is the **single current phase tracker**. Historical plans and outdated release descriptions are retained in Git history, not copied into every document. Read the [target architecture](./ERP_TARGET_ARCHITECTURE.md), [operator-first UX blueprint](./OPERATOR_FIRST_ERP_BLUEPRINT.md) and [operations runbook](./OPERATIONS.md) for the design and release rules.

## Non-negotiable product contract

**Enterprise-grade controls, not an enterprise-sized ERP.** Sohojac is one Cloudflare-native modular monolith built for a small coaching centre and its staff. The ERP is English-only, dark-only, accessible and mobile-friendly, rooted at `/dashboard`. Guardians and students do **not** have accounts; SMS is the intended guardian communication channel. Maintain immutable student/staff IDs, real financial double-entry postings, reliable retries, complete audit history and **12 students maximum per batch**.

Operator tasks—not SQL tables—drive navigation: enquiries, admissions, students, batches, payments, programme launch, attendance, and practical help. Management-only finance, subjects, payroll, governance and configuration remain permission-gated. Production data is never reset, copied to dev or silently rekeyed.

## Current environment / production gate

| Branch | Cloudflare Worker | D1 | Policy |
|---|---|---|---|
| Feature branch | PR tests / disposable local D1 | No remote writes | Review source, migrations, regression and secrets |
| **`dev`** | `sohojac-dev.a90-sattar.workers.dev` | **`sohojac_dev`**, ID `90552767-7eb9-44a1-9505-124acd316cd7` | Automatic development-only deployment after verified merge, keep dev owner and data |
| **`master`** | `sohojac.com` | **`sohojac`**, existing protected ID | **Only after owner reviews the actual dev site, explicitly approves the tested revision, and a reviewed PR merges to master**. Deployment requires manual Actions dispatch with `APPROVE_SOHOJAC_PRODUCTION` and exact approved master SHA |

The [verified dev deployment on commit `a971a790`](https://github.com/AbdusSattar-70/sohojac/actions/runs/41145393378) passed CI, Worker DB name/ID binding checks and private API denial. It did not trigger production. Environment secrets and Better Auth sessions are independent. The first OWNER was set up in dev with an expiring ticket; there is no factory admin account.

### Database schema rule

- **Active dev migrations:** exactly four files in `migrations/`: `0001_schema_tables.sql`, `0002_schema_indexes.sql`, `0003_domain_guards.sql` and `0004_finance_reference.sql`.
- **Production compatibility:** preserve the **36 original immutable migration files** under `migrations/history/`. Production already records those filenames in `d1_migrations`. **Do not delete this history or apply the four-file fresh dev baseline to production.**
- The initial one-time `sohojac_dev` reset was completed and verified in [run #41137793638](https://github.com/AbdusSattar-70/sohojac/actions/runs/41137793638). **That reset is finished, and its destructive command has been retired.** Future dev deployments must preserve existing identities and records; CI checks schema parity, branch/ID guards and separate recovery bookmarks.
- Schema changes after this baseline must be non-destructive forward migrations with parity/foreign-key tests, backfill audits, idempotency and separately approved production equivalents. The target of 3–5 baseline files does not justify editing production's applied migration history.

## Verified delivery tracker

| Area | Current status | Evidence / next gate |
|---|---|---|
| **0E — Dev/prod isolation** | **Deployed** | Dev Worker binding verified. Production never shares dev D1 or secrets. |
| **0F — Fresh D1 baseline** | **Deployed** | Four canonical migrations, global reference subjects, Classes 1–12 and guardian relationship masters; independent first OWNER created. |
| **2 — Payment / expense / batch commands** | **Deployed to dev** | [PR #52](https://github.com/AbdusSattar-70/sohojac/pull/52): stable request identities, permission checks, balanced journals, 12-seat and version guards; full operation acceptance remains owner-led. |
| **C1 — Guided Programme Launch** | **Deployed to dev** | [PR #54](https://github.com/AbdusSattar-70/sohojac/pull/54): coaching draft → fee plan → batch activation → website/intake → readiness. |
| **C1a — Correct fifth-step completion** | **Deployed to dev** | [PR #55](https://github.com/AbdusSattar-70/sohojac/pull/55): the Review check is tied to actual live intake, not the first four steps only. |
| **C2a — Global subject directory and repository cleanup** | **Implementing on `feature/operator-first-subject-catalogue`** | One global `academic_subjects` read model, read-only legacy association audit, retire new class-specific subject creation, remove obsolete reset/UI/hash-parity artifacts and completed PR branches. **CI and deployment still pending.** |
| **C2b — Subject identity cutover** | **Not implemented** | Inventory every legacy subject ID and teaching/public consumer, explicitly approve crosswalk, forward-migrate and reconcile links. No name-based implicit merges or record deletion. |
| **C3 — Master-data concurrency** | Planned | Named permissions and optimistic version checks for academic years, subjects, classes, groups and programmes; regression tests for conflicting saves. |
| **C4 — Operator daily journeys** | Planned | Admission and returning student, due follow-up and receipts, teacher session/attendance/marks, role/desktop/mobile testing. |
| **C5 — Finance/reports and messages** | Planned | Whole-ledger aggregates rather than latest-200 headlines; reconciled reports, SMS outbox/retries, recovery drill, accessibility/performance checks. |
| **Production acceptance** | **Not authorized** | Owner must manually test and approve the exact dev revision. No automatic merge or production release. |

## C2 — Subject master policy

`academic_subjects` already contains the **global subject directory**. The old `academy_subjects` table stores grade/group-specific historical identities, while `academy_offering_subjects` may still point to those IDs. It is **unsafe to drop, rename or auto-merge these tables** before verifying every public card and teaching/assessment consumer. The first C2 slice:

1. Shows the global directory once, separate from class/group curriculum applicability, without duplicate grade-based master creation.
2. Provides a permission-checked, **read-only audit** of every legacy row and its linked offering count.
3. Disables new legacy class-scoped subject creation; keeps old identities and approved assignment/update compatibility until cutover.
4. Preserves the four-file baseline, the current dev D1 and the OWNER's existing account.
5. Adds actual SQLite regression tests for global subjects, historical links, foreign keys, and denial of legacy creation.

**Cutover gate:** map explicit original subject IDs to canonical IDs with reviewed evidence. Test bidirectional row/link counts, JSON public cards, teacher sessions, timetable/exams and audit history, then change each reader/writer transactionally. Retire legacy tables **only after** this evidence and independent owner approval. No silent data cleanup is acceptable.

## Release checklist per bounded feature

1. Branch from current `dev`, change one coherent workflow, and preserve role/grant checks, audit, retry and immutable business IDs.
2. Run schema/reference tests, real named-permission and financial regressions, TypeScript, Worker build and authenticated local HTTP smoke against disposable D1.
3. Review PR and merge to **dev only after the exact source revision passes**. Deploy to `sohojac_dev`; verify actual Worker D1 binding, four baseline migrations, application routes and private access, preserving records.
4. Publish verified PR/Actions evidence and request **manual owner testing**. Changes may be rejected or refined on dev.
5. **Never** merge or deploy to `master` until the owner explicitly approves the tested revision. Production uses its own recovery bookmark, migration history, deployment and restore plan.

Git history preserves the older shared-D1 experiment and prior source-mirroring decisions as historical evidence; they are **not** the current architecture or deployment policy.
