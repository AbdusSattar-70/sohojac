# Sohojac — operator-first coaching ERP

Cloudflare-native public website and staff ERP for Sohoj Academy, implemented as a modular monolith. The staff application is English-only, dark-only and rooted at `/dashboard`. Students and guardians do not need accounts.

**Principle:** Enterprise-grade controls without enterprise-sized complexity. Build obvious tasks for staff while retaining permissioned commands, accurate receipts, auditable history and recovery.

## Environments and release ownership

| Git branch | Cloudflare D1 | Release |
|---|---|---|
| `feature/*` | Disposable local D1 only | Review PR and run tests |
| `dev` | **`sohojac_dev`**, an independent new D1 | Deploy to dev for hands-on owner acceptance |
| `master` | **`sohojac`**, existing production D1 | **Only an owner-approved manual production release** |

Do **not** automatically merge `dev` into `master`. Production requires a reviewed, merged master revision and a GitHub Actions manual dispatch with `APPROVE_SOHOJAC_PRODUCTION` and the exact master commit SHA. A green CI run does not replace the owner's manual review of dev.

The new CI file is `.github/workflows/erp-ci.yml`. Before any dev migration, its deployment script provisions/verifies exact `sohojac_dev` D1 name and UUID, refusing to use the production ID. All staff credentials, Turnstile keys, provider notifications, recovery points and data are independent. The `dev` Worker is already bound to independent D1 `sohojac_dev`. Each approved `dev` merge runs schema checks, a dev-only release and an actual Worker binding verification. No feature branch can reset a remote database.

## Local development

Use Node 24 and the committed pnpm lockfile.

```sh
pnpm install --frozen-lockfile
cp .env.example .env
pnpm run cf-typegen
pnpm exec tsc --noEmit
pnpm run build
node --test scripts/test-environment-isolation.mjs
```

Run disposable local migrations/tests; never run remote migrations from a feature branch. The extracted authenticated integration suite is `bash scripts/ci-authenticated-smoke.sh` after local D1 migrations and CI owner setup. Consult the workflow for the full test setup. The fresh dev-only reference seed is `seeds/dev-reference.sql`, with Classes 1–12, 27 guardian relationships and one global academic-subject list; it creates no student, guardian, admission or payment examples.

**Development migrations:** four clean SQL files, with **one global Subject master directly in the initial schema**. The independently named development D1 can be recreated because its data is mock; doing so resets the dev owner account and all mock records. Development uses `--dir migrations` on its own `sohojac_dev` database. Production retains its independent history and database; do not apply development migrations to production. See [Fresh dev first owner](docs/DEV_FIRST_OWNER.md).

The one-time development reset was completed and verified in [dev release #41137793638](https://github.com/AbdusSattar-70/sohojac/actions/runs/41137793638). The reset script is retired; subsequent deployments preserve existing developer accounts, student records and financial test history. There is **no automatic production schema replacement**.

## Design and operations

- [Operator-first workflow blueprint](docs/OPERATOR_FIRST_ERP_BLUEPRINT.md)
- [ERP target architecture and ADRs](docs/ERP_TARGET_ARCHITECTURE.md)
- [Development phases and acceptance](docs/DEVELOPMENT_STRATEGY.md)
- [Security, release and recovery runbook](docs/OPERATIONS.md)
- [Fresh development database and first-owner setup](docs/DEV_FIRST_OWNER.md)

**Redesign status (31 Oct 2026):** subject simplification is implemented on a dev feature branch, pending isolated deployment verification. Subjects are one reusable master under Academic Setup; guided Programme Launch and advanced website settings share that list. Old per-class subject definitions, redundant subject API routes and legacy review screens are removed. No student/guardian login is introduced. Further academic master concurrency and day-to-day workflows remain planned.
