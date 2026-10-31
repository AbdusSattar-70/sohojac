# Sohojac — development strategy and verified delivery status

Updated: **31 October 2026**. This is the **single current phase tracker**. Historical plans and outdated release descriptions are retained in Git history, not copied into every document. Read the [target architecture](./ERP_TARGET_ARCHITECTURE.md), [operator-first UX blueprint](./OPERATOR_FIRST_ERP_BLUEPRINT.md) and [operations runbook](./OPERATIONS.md) for the design and release rules.

## Non-negotiable product contract

**Enterprise-grade controls, not an enterprise-sized ERP.** Sohojac is one Cloudflare-native modular monolith built for a small coaching centre and its staff. The ERP is English-only, dark-only, accessible and mobile-friendly, rooted at `/dashboard`. Guardians and students do **not** have accounts; SMS is the intended guardian communication channel. Maintain immutable student/staff IDs, real financial double-entry postings, reliable retries, complete audit history and **12 students maximum per batch**.

Operator tasks—not SQL tables—drive navigation: enquiries, admissions, students, batches, payments, programme launch, attendance, and practical help. Management-only finance, subjects, payroll, governance and configuration remain permission-gated. Production data is never reset, copied to dev or silently rekeyed.

## Current environment / production gate

| Branch | Cloudflare Worker | D1 | Policy |
|---|---|---|---|
| Feature branch | PR tests / disposable local D1 | No remote writes | Review source, migrations, regression and secrets |
| **`dev`** | `sohojac-dev.a90-sattar.workers.dev` | **`sohojac_dev`**, ID automatically verified independent UUID | Automatic development-only deployment after verified merge, keep dev owner and data |
| **`master`** | `sohojac.com` | **`sohojac`**, existing protected ID | **Only after owner reviews the actual dev site, explicitly approves the tested revision, and a reviewed PR merges to master**. Deployment requires manual Actions dispatch with `APPROVE_SOHOJAC_PRODUCTION` and exact approved master SHA |

The [verified dev deployment on commit `a971a790`](https://github.com/AbdusSattar-70/sohojac/actions/runs/41145393378) passed CI, Worker DB name/ID binding checks and private API denial. It did not trigger production. Environment secrets and Better Auth sessions are independent. The first OWNER was set up in dev with an expiring ticket; there is no factory admin account.

### Database schema rule

- **Active dev migrations:** four clean foundation files with a global `academic_subjects` master from the start. The independent dev D1 is recreated once for this baseline; no obsolete migration 0005 or legacy subject history remains.
- **Environment isolation:** recreate only `sohojac_dev` once and retain four clean migrations. `master` retains its separate production schema and history. Never apply dev SQL rewrites to production.
- **New owner authorization, 31 October 2026:** the current dev records are mock data and may be reset. The branch/name/UUID-guarded one-time reset recreates only the known obsolete `sohojac_dev`, then uses four clean migrations; later releases leave a clean dev D1 unchanged.
- Schema changes after this baseline use a fifth non-destructive forward migration for academic master versioning; future migrations with parity/foreign-key tests, backfill audits, idempotency and separately approved production equivalents. The target of 3–5 baseline files does not justify editing production's applied migration history.

## Verified delivery tracker

| Area | Current status | Evidence / next gate |
|---|---|---|
| **0E — Dev/prod isolation** | **Deployed** | Dev Worker binding verified. Production never shares dev D1 or secrets. |
| **0F — Fresh D1 baseline** | Clean rebuild planned in PR #60 | Exactly four clean migrations and one global Subject; Classes 1–12 and guardian relationships seed after reset. First OWNER must re-enroll. |
| **2 — Payment / expense / batch commands** | **Deployed to dev** | [PR #52](https://github.com/AbdusSattar-70/sohojac/pull/52): stable request identities, permission checks, balanced journals, 12-seat and version guards; full operation acceptance remains owner-led. |
| **C1 — Guided Programme Launch** | **Deployed to dev** | [PR #54](https://github.com/AbdusSattar-70/sohojac/pull/54): coaching draft → fee plan → batch activation → website/intake → readiness. |
| **C1a — Correct fifth-step completion** | **Deployed to dev** | [PR #55](https://github.com/AbdusSattar-70/sohojac/pull/55): the Review check is tied to actual live intake, not the first four steps only. |
| **C2a — Single global subject directory** | Previously deployed | One reusable subject master under Academic Setup, shared with Classes, Groups and Programmes. |
| **C2b — Remove duplicate subject model** | Implemented in PR #60; pending verified dev release | One reusable Subject entity, no class-specific subject master, no obsolete subject APIs/audits/migrations; dev mock D1 rebuilt without production impact. |
| **C3 — Master-data concurrency** | **C3b implemented, release pending** | Academic years and seven other Academic Setup entities use D1 revision locks with stale-save rejection, retry guidance, audit on committed writes and regression tests. |
| **C4 — Operator daily journeys** | Planned | Admission and returning student, due follow-up and receipts, teacher session/attendance/marks, role/desktop/mobile testing. |
| **C5 — Finance/reports and messages** | **C5a reporting implemented, release pending** | All-record per-journal and receipt-allocation exception checks, monthly payment-method breakdown and dark ERP reporting. SMS delivery/outbox, recovery drill and complete performance acceptance remain separate unfinished C5b gates. |
| **Production acceptance** | **Not authorized** | Owner must manually test and approve the exact dev revision. No automatic merge or production release. |

### C2b — Clean-slate Subject policy (owner decision, 31 October 2026)

A Subject is **one ordinary master record**, just like a Class, Group or Programme. Each record has an ID, code, title and active status. A Subject is not copied per class or group. Staff may select a subject in any programme from a single reusable list; selecting none means a general/full-package programme.

The old `academy_subjects` table, old subject-assignment API routes, read-only legacy ID audit, duplicate subject directory and per-grade filtering are removed from `dev`. The offering-to-subject relationship remains a lightweight join (`academy_offering_subjects`) but its foreign key now points to `academic_subjects`. It is a link, not a second subject definition.

`sohojac_dev` contains mock/testing data, so the owner authorized a full isolated dev reset. The old class-specific subject master, assignments and compatibility migrations are absent from the clean four-file baseline. This also resets development owner sign-in and mock staff/student/admission/finance records. Recreate the dev first-owner ticket after deployment; never reset production.

Teaching assessments may still use free-text subject labels until a separate normal subject picker is implemented; these text labels do not justify reintroducing a second master.

## C3a — Academic year conflict handling

The existing academic-year API already used `version` checks, but the Academic Setup Server Action discarded the version and could overwrite another staff member's save. C3a carries the displayed version through the editor into a conditional `UPDATE ... WHERE id=? AND version=?`, with an explicit stale-edit error. The insert/update audit remains conditional on an actual saved row. Rejected edits preserve the year and do not produce fabricated audit events. Other master tables do not yet have the same protections; C3b requires a reviewed forward migration and version checks in each writer.

## Release checklist per bounded feature

1. Branch from current `dev`, change one coherent workflow, and preserve role/grant checks, audit, retry and immutable business IDs.
2. Run schema/reference tests, real named-permission and financial regressions, TypeScript, Worker build and authenticated local HTTP smoke against disposable D1.
3. Review PR and merge to **dev only after the exact source revision passes**. Deploy to `sohojac_dev`; verify actual Worker D1 binding, the reviewed four-migration schema, application routes and private access, preserving records.
4. Publish verified PR/Actions evidence and request **manual owner testing**. Changes may be rejected or refined on dev.
5. **Never** merge or deploy to `master` until the owner explicitly approves the tested revision. Production uses its own recovery bookmark, migration history, deployment and restore plan.

Git history preserves the older shared-D1 experiment and prior source-mirroring decisions as historical evidence; they are **not** the current architecture or deployment policy.
