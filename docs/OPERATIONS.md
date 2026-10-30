# Operations and security runbook

## Supported releases

The single `public-site-check.yml` pipeline contains regression checks plus `dev` and main
`master` releases using the SAME `sohojac` D1. Feature PRs targeting dev run checks only; dev-to-master promotion reuses the verified dev run,
then the master push independently checks the exact production merge. Do not add a competing manual/public-only deploy workflow.
Both release paths capture a verified D1 Time Travel bookmark before pending migrations and preserve
it as a seven-day Actions artifact. The three pre-0029 immutable snapshots also remain available.
Use `STUDENT_LIFECYCLE_RELEASE_PLAN.md` for the reviewed canonical rebuild and recovery limits.
A bookmark is not an exercised restore: Phase 4 must demonstrate application/database recovery together.

## GitHub Actions configuration

Production secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `BETTER_AUTH_SECRET`,
`TURNSTILE_SECRET_KEY`. Production variables: `TURNSTILE_SITE_KEY`, optional `BETTER_AUTH_URL`
(default `https://sohojac.com`). The token needs Workers deployment and D1 migration/bookmark access.
Keep the auth secret stable across releases. Never put secrets in code, logs, issues or chat.

Dev variables/secrets: `DEV_TURNSTILE_SITE_KEY`, `DEV_TURNSTILE_SECRET_KEY`, optional
`DEV_BETTER_AUTH_SECRET`. Its actual workers.dev hostname must be allowed by that Turnstile widget.
Both deployments bind the existing `sohojac` D1. No dev database is provisioned. Without dev Turnstile keys, anonymous account
forms are deliberately unavailable, rather than silently accepting unverified requests.

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

- `DEVELOPMENT_STRATEGY.md`: current phases and acceptance.
- `legacy-erp-inventory.json`, `source-first-erp-manifest.json`: pinned test/reference inputs.
- `SOURCE_OFFERINGS_D1_MAPPING.md`, `STAFF_NUMBER_MIGRATION.md`,
  `STUDENT_LIFECYCLE_RELEASE_PLAN.md`: historical identity/data-preservation contracts.
- Applied migrations and regression scripts are permanent evidence, not disposable setup files.

Superseded draft/release/status/setup notes were consolidated here and into the strategy. Their
history remains in Git. Do not create another competing roadmap for each feature.

## Shared development database and seed

The user explicitly chose one DB for this development installation. Both URLs see the same records;
existing main OWNER credentials work on dev. Sessions remain hostname-specific. Dev changes affect
main data immediately, and both release jobs serialize through `sohojac-shared-d1-release`.

The dev release runs the repeatable `seeds/development.sql` after migration/recovery capture.
Search ERP lists for TEST: campus, year, class, Mathematics, programme, fee v1, Batch A, one returning
student, two admission drafts and one CRM prospect. The offering is hidden from the public website.
The synthetic contact is test data, not a real guardian. Review, consent, billing/payment and activation
still require their normal operator commands. Re-running the seed does not reset staff edits or accounts.
No database reset is needed or performed. Credentials/passwords are never seeded.

After the verified dev Worker deploy, retirement checks both Worker D1 bindings and captures the former
dev-only database bookmark before deleting only the exact former `sohojac-dev` resource. A separate
seven-day Actions artifact records that retirement. Recovery of a deleted database requires Cloudflare
undelete before its bookmark can be used; this metadata is not a standalone SQL database export.
