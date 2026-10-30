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

The new CI file is `.github/workflows/erp-ci.yml`. Before any dev migration, its deployment script provisions/verifies exact `sohojac_dev` D1 name and UUID, refusing to use the production ID. All staff credentials, Turnstile keys, provider notifications, recovery points and data are independent. Dev DB creation happens **only after the feature branch merges to `dev` and Cloudflare secrets are available**; this branch alone does not create or reset any remote resource.

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

**New development migration model:** only **four canonical SQL files** live directly under `migrations/`. They are a verified snapshot of the final schema and real finance account masters, with no historical rebuild patches, demo offerings, students or payments. The **36 unchanged production migration files** are archived at `migrations/history/`; `master` keeps its applied history and will use `--dir migrations/history` only after separate owner approval. Development uses `--dir migrations`. See [Fresh dev first owner](docs/DEV_FIRST_OWNER.md).

The original, isolated `sohojac_dev` database is reset **one time** to adopt this clean baseline, never production. Its new UUID is independently re-verified, fresh migrations are applied, and reference-only seed runs. No automatic production schema replacement is permitted.

## Design and operations

- [Operator-first workflow blueprint](docs/OPERATOR_FIRST_ERP_BLUEPRINT.md)
- [ERP target architecture and ADRs](docs/ERP_TARGET_ARCHITECTURE.md)
- [Development phases and acceptance](docs/DEVELOPMENT_STRATEGY.md)
- [Security, release and recovery runbook](docs/OPERATIONS.md)
- [Fresh development database and first-owner setup](docs/DEV_FIRST_OWNER.md)

**Current status:** This is a feature branch for the first infrastructure/UX slice, not an already verified dev deployment, not a finished finance redesign, and not a claim of enterprise certification. Never commit real secrets or copy student/guardian/financial production data into development.
