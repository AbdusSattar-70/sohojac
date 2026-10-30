# Operations and security runbook

## Supported releases

**Target policy approved 31 October 2026; feature-branch implementation committed, deployment pending:** The `dev` branch/Worker must use a separately created **`sohojac_dev`** D1. The `master` branch/production Worker must use the existing **`sohojac`** D1. No cross-environment binding, session, seed, migration, snapshot or write is allowed.

The former `public-site-check.yml` was replaced by `erp-ci.yml`, which enforces per-environment targets in code. Actual isolated provisioning and deployed binding inspection are still required. Feature PRs target `dev` and run CI; `dev` code is deployed only to its dev Worker and `sohojac_dev`. **The owner manually reviews the actual deployed dev application, then explicitly approves or rejects promotion of the tested commit. No bot, passing CI run or auto-merge may move `dev` to `master`.** Once approved, a reviewed PR may merge to `master`; a separate manual workflow dispatch with `APPROVE_SOHOJAC_PRODUCTION` and the exact approved master SHA runs the production build, production-only migration and Worker deployment. The production database must never be reset by the dev branch.

Retain separate environment recovery bookmarks, migration/seed jobs and audit records. Both release paths capture a verified D1 Time Travel bookmark for **their own database** before pending migrations and preserve it under the applicable retention policy. The three pre-0029 immutable snapshots remain historical evidence. Do not add a competing manual/public-only deploy workflow.
Use `STUDENT_LIFECYCLE_RELEASE_PLAN.md` for the reviewed canonical rebuild and recovery limits.
A bookmark is not an exercised restore: Phase 4 must demonstrate application/database recovery together.

## GitHub Actions configuration

Production secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `BETTER_AUTH_SECRET`,
`TURNSTILE_SECRET_KEY`. Production variables: `TURNSTILE_SITE_KEY`, optional `BETTER_AUTH_URL`
(default `https://sohojac.com`). The token needs Workers deployment and D1 migration/bookmark access.
Keep the auth secret stable across releases. Never put secrets in code, logs, issues or chat.

Dev secrets/variables: `DEV_TURNSTILE_SITE_KEY`, `DEV_TURNSTILE_SECRET_KEY`, a **separate required** `DEV_BETTER_AUTH_SECRET`. The dev provisioner derives `BETTER_AUTH_URL` from the actual dev hostname. The guarded dev provisioner creates or verifies exact `sohojac_dev` and exports its actual returned ID as `SOHOJAC_DEV_D1_ID`; never copy the production `sohojac` ID. Its actual workers.dev hostname must be allowed by that dev Turnstile widget.

**Before enabling remote dev deploys**, validate `dev → dev Worker → sohojac_dev / dev-ID` and `master → main Worker → sohojac / production-ID`; checks must fail closed on an unexpected name, ID, hostname or branch. Keep auth data and secrets isolated, and route all trial SMS/email through sandbox or allow-list. Without dev Turnstile keys, anonymous account forms deliberately remain unavailable rather than bypassing verification. **This paragraph describes the required configuration, not a claim that it is already installed.**

Optional staff email: configure `STAFF_EMAIL_FROM` and `RESEND_API_KEY` together with a verified sender.
No guardian/student account or email notification is enabled by this setting.

## Turnstile

Use a managed widget for each intended environment. Allow the actual public/staff hostnames, including
any separately used ERP subdomain. The server verifies success, exact hostname and expected action;
expired or replayed tokens fail. Account forms send `x-turnstile-token`; existing public forms send their
form token to their handler. A token is single-use: retry requires a fresh challenge.

`GET /api/security/challenge` exposes only public site-key/readiness data. It never exposes the secret.
In production a 503 here means keys/configuration are unavailable. Do not disable the guard to work
around a configuration failure. Navigation still works; protected form submission fails closed.

## Application request limits

| Scope | Limit per trusted client IP | Response |
|---|---|---|
| Sign-in | 10 attempts / 5 minutes | 429 with Retry-After |
| Password-recovery request | 3 / 15 minutes | 429 with Retry-After |
| Password reset, invitation, owner setup | 10 per endpoint / 15 minutes | 429 with Retry-After |
| Public interest/admission and access requests | Shared 10 / minute | 429 with Retry-After |
| Other API writes and all page Server Actions | Shared 240 / minute | 429 with Retry-After |

Quotas are fixed windows, not account lockouts. Shared networks share IP budgets; tune from actual
usage and test denial/retry behavior before changing them. Cloudflare's trusted connecting-IP header
is required on deployed mutation requests. Missing metadata, D1 failure or verification outage returns
503. Mutations require same origin. Never trust a browser-supplied actor or role.

Counter expiry is indexed; each write prunes at most 100 expired counters. Monitor D1 row writes and
counter growth. An edge-level rate limit can reject traffic earlier without consuming application D1,
but no WAF configuration is claimed by this code release.

## First owner, only when no owner exists

Keep the one-time setup route: it requires an expiring random ticket and refuses a second owner.
Create an authorized ticket through the D1 Console, never a plaintext password. Inspect the actual
`staff_owner_setup` schema before preparing the insert; use a cryptographically random 64-hex token,
real operator-approved email/name and short expiration. Enter the token and password on `/setup-owner`
after completing Turnstile. Existing installations must not rerun bootstrap or reset live identities.

## Local verification

Use Node 24 and the package-manager version pinned in package.json. Install the frozen lockfile,
copy `.env.example` to gitignored `.env`, set a separate local auth secret and loopback auth URL,
apply migrations only with `--local`, generate Worker types, type-check and build. CI includes the
full local D1 and authenticated HTTP regression suite. Local bypass is restricted to loopback in both
request URL and configured auth origin; production and dev have no bypass flag.

## Documentation retained intentionally

- `DEVELOPMENT_STRATEGY.md`: current phases, environment decision and acceptance.
- `ERP_TARGET_ARCHITECTURE.md`, `OPERATOR_FIRST_ERP_BLUEPRINT.md`: target domain boundaries, isolated dev/prod approval model and proposed UX (not yet implemented).
- `legacy-erp-inventory.json`, `source-first-erp-manifest.json`: pinned test/reference inputs.
- `SOURCE_OFFERINGS_D1_MAPPING.md`, `STAFF_NUMBER_MIGRATION.md`,
  `STUDENT_LIFECYCLE_RELEASE_PLAN.md`: historical identity/data-preservation contracts.
- Applied migrations and regression scripts are permanent evidence, not disposable setup files.

Superseded draft/release/status/setup notes were consolidated here and into the strategy. Their
history remains in Git. Do not create another competing roadmap for each feature.

## Development database provisioning and owner-controlled production promotion

**Required change:** Create a **new** Cloudflare D1 named exactly **`sohojac_dev`**. The hyphenated `sohojac-dev` was a **different legacy resource** that was previously retired and must not be silently restored/reused. The existing `sohojac` D1 remains production, with its data, access, migration history and identity intact. These steps are **pending**; the current deployed dev Worker still points to `sohojac` until separate bindings are verified.

1. Provision `sohojac_dev` using Cloudflare D1 Console or the supported Cloudflare CLI. Capture the **new** real ID and keep branch→Worker→DB name/ID mappings explicit in Worker config, `lib/database-target.ts` and GitHub Actions. Never guess or reuse a production database ID.
2. Apply the complete ordered, versioned schema migrations to `sohojac_dev` **only**. Verify foreign keys, triggers, audit and permission grants. Seed Academic Setup reference masters (Classes 1–12, guardian relationships, subjects/programmes/years) with independent idempotent dev seeds. For end-to-end tests use **synthetic** students/guardians and dummy finance; do not copy real production credentials or personal/financial data. Owner bootstrap/invitation must use the dev hostname, credentials and secret only.
3. Configure dev-only `Better Auth` URL/secret, Turnstile widget and hostname, staff accounts, SMTP/SMS sandbox or strict recipient allow-list. Confirm production tokens/variables are unavailable in the dev deployment job. Staff accounts and sessions are **not** expected to work interchangeably.
4. Update and run deployment guard tests: a `dev` build can migrate, seed, restore and deploy **only `sohojac_dev`**; `master` can do so **only `sohojac`**. Unexpected refs, ID mismatch, or missing secret stop release before D1 mutation. Keep separate backups/bookmarks, migrations, monitoring, release logs and optional per-environment concurrency controls; no shared-database lock is required after genuine isolation.
5. Confirm the dev Worker uses the correct D1 binding by inspection; create a uniquely identifiable **safe dev record**, verify it is absent from production, ensure production row counts remain unchanged, and test staff-auth isolation. Record actual IDs/URLs in protected release logs and non-sensitive proof in the PR. **Do not treat mere docs or successful deploy status as proof of isolation.**
6. **Release workflow:** Feature branch → PR / tests → merge to `dev` → automatic **dev-only** deployment → owner manually exercises the live dev site on desktop/mobile and checks the required workflows → owner explicitly records **Approve this tested SHA for master** (or returns changes). Only then open/review/merge a PR to `master`; master CI independently validates and deploys to the main Worker and **only `sohojac`**. No automatic dev→master merge, cron promotion or CI-as-approval.
7. Keep production backups and restore procedures independent. Production changes occur only after owner approval; **never reset `sohojac` from a dev seed or test suite**. Production records may be corrected only through explicitly authorized business workflows and separately approved, reversible data migrations. Dev may be reset or reseeded when authorized, without affecting production.

**Historical note:** On 30 October 2026 the owner approved temporarily sharing one D1 and the system executed a one-time foundation reset with `scripts/reset-foundation.mjs` and `seeds/foundation.sql`. That operation preserved then-existing administrator identity and installed reference registers. Previous releases also used `seed-public-catalogue.mjs` on the shared D1, and retired the **old hyphenated `sohojac-dev` database**. Those actions remain historical evidence. Do **not** rerun the foundation reset, old-database retirement, or former shared-D1 seed flow as part of the new environment setup. Existing production seed completion markers must remain in place.

**Current risk until deployed verification:** The checked-in config is separated, but the actual deployed dev binding has not yet been verified on the new release. Do not use the live dev Worker for destructive/financial trial writes until the dev-specific D1 exists and strict binding checks pass. Use disposable local D1 for testing during the transition.

## Public catalogue and batch readiness

`seed-public-catalogue.mjs` was previously applied once to the old shared D1; `public-catalogue-20261030-v1` records the historical completion. In the new design, each database maintains **independent migration and seed state**. Production `sohojac` keeps its existing offerings and marker. Initialize `sohojac_dev` with its idempotent clean reference bootstrap only; programme offerings, batches and prices require explicit dev operator setup; never run dev seeds on production or infer production seed completion from dev. Subsequent deployments preserve legitimate edits in their own environment and do not repeat the production foundation reset.
The three public Boys Evening Care offerings use Class 8 ৳2,500/month and Classes 9–10 ৳3,000/month,
with 12-seat batches. Actual schedules and other programmes' fees must be configured by staff.

Create an offering draft → publish today's Fee Plan to activate it → configure public visibility/intake
→ create a batch. Batch choices disable offerings missing active context/current fees. A disabled submit
button is no longer used to conceal validation errors: submit shows the fields that need attention.
Academic years are managed within Academic Setup; old separate-year bookmarks redirect there.

## New implementation branch and CI checklist

The feature branch `feature/operator-first-erp` replaces the previous combined CI with `.github/workflows/erp-ci.yml`. Its `quality` job executes the existing substantive local-only security/domain/integration checks and the extracted authenticated smoke script. Its `development` job can create the **new** `sohojac_dev` D1 through the Cloudflare API and verifies exact name/ID before migration, and Worker `DB` binding after deployment. Its `production` job is **manual dispatch only** on `master`, requires the typed confirmation `APPROVE_SOHOJAC_PRODUCTION` and a matching reviewed master SHA; `master` pushes alone will not deploy.

Required before first dev deployment: `CLOUDFLARE_API_TOKEN` with D1 Create/Edit and Workers Edit/Read, `CLOUDFLARE_ACCOUNT_ID`, separate `DEV_BETTER_AUTH_SECRET` (32+ characters), `DEV_TURNSTILE_SECRET_KEY`, and `DEV_TURNSTILE_SITE_KEY`. The dev Worker creates test accounts independently through its own owner/invitation workflow. Do not configure real guardian SMS recipients in dev. The pipeline fails closed when secrets or DB identity are unavailable. To apply the new pipeline, merge the reviewed feature PR into `dev`; **do not merge or promote to `master`** before the owner tests the deployed dev version.

The fresh development seed is `seeds/dev-reference.sql`, not the old reset tool. It is only applied once, to a verified new dev database without business records. Production's historical migration and seed markers are never reset. Keep existing migration history for production upgrades; schema consolidation requires later reviewed forward migrations. Do not claim production or dev isolation complete based solely on this document.
