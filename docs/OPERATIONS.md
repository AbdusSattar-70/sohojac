# Sohojac — operations, security and release runbook

Updated: **31 October 2026**. This is the **active operational reference**, not a proposed setup guide. The [development strategy](./DEVELOPMENT_STRATEGY.md) owns phase status; [architecture](./ERP_TARGET_ARCHITECTURE.md) and [operator-first UX blueprint](./OPERATOR_FIRST_ERP_BLUEPRINT.md) define the target. Historical reset and shared-D1 instructions were removed from active procedures and remain accessible through Git history.

## Environment contract — strictly separated

| Environment | Worker / origin | D1 database | Authentication |
|---|---|---|---|
| `dev` | `sohojac-dev.a90-sattar.workers.dev` | **`sohojac_dev`**, UUID independently resolved and verified | **Independent** Better Auth secret, sessions, Turnstile widget and first OWNER |
| `master` | `sohojac.com` | **`sohojac`**, original protected UUID `d6f3e4e9-2190-43bf-bc90-969687f6db78` | Production-only secret, sessions, Turnstile, student/guardian/staff/finance data |

**Verified:** [dev release #41145393378](https://github.com/AbdusSattar-70/sohojac/actions/runs/41145393378) showed correct Cloudflare D1 name/ID and deployed Worker binding, healthy public routes and unauthenticated private API denial. **No `master` promotion or production D1 reset.** Do not copy credentials, actual student/guardian personal data, consent documents, invoices, receipts or SMS recipient lists between environments.

## Schema and seed: four clean foundation migrations

Development uses **only** `migrations/0001_schema_tables.sql`, `0002_schema_indexes.sql`, `0003_domain_guards.sql`, `0004_finance_reference.sql`:

```bash
pnpm exec cf d1 migrations apply "$SOHOJAC_DEV_D1_ID" --dir migrations --mode staging
```

The owner approved full reset of the disposable `sohojac_dev` test database for this redesign. There are four clean source migrations, containing only the one global `academic_subjects` master and its offering join. One-time dev database recreation is branch/name/UUID gated; production never runs this workflow.

The owner explicitly authorized another **mock-only** `sohojac_dev` reset for this clean Subject design. The dev-only action verifies `refs/heads/dev`, database name, distinct UUID and known old schema before deleting and rebuilding `sohojac_dev` once. Existing dev OWNER login and all mock records are erased. The clean four-file schema does not trigger further resets. `master` and `sohojac` production are never touched.

Staff numbering, student identity and financial preservation are now verified against the active canonical schema and domain regression tests. Superseded migration release plans can still be read in Git history; they are not current development instructions.

## GitHub Actions release and branch cleanup

The only active deployment workflow is `.github/workflows/erp-ci.yml`.

- **Feature PR → `dev`:** local SQLite/D1 regression and authenticated HTTP smoke, schema parity, named permission/financial tests, TypeScript and Worker build. No remote DB mutation.
- **`dev` push:** after quality checks, detect old mock-only schema and rebuild `sohojac_dev` once, then provision and verify its new UUID, capture a dev-only recovery bookmark, apply four clean migrations, seed reference masters, deploy dev Worker, verify binding and check private access. Never deploy to production from this workflow.
- **Closed-PR branch housekeeping:** only after the dev deployment succeeds, a separate job with limited `contents: write` token checks a fixed list of historical feature branches, the closed PR status and exact branch HEAD before removing a ref. Never remove `dev`, `master`, changed branches or branches with open PRs. The cleanup is noncritical to application data.
- **`master`:** **no automatic production deployment on push**. The owner must manually test the dev site, explicitly approve the tested revision, review/merge the production PR, and dispatch Actions on `master` with `APPROVE_SOHOJAC_PRODUCTION` and the exact approved master SHA. The production job checks branch/ID, captures a separate production bookmark, uses the production migrations independently maintained on `master`, deploys and verifies the production Worker. Green CI alone is not permission to promote.

Before changing a production command, verify scope, approvals, D1 Time Travel retention and an actual recovery strategy; bookmarks are **not** tested restores. Keep the D1 account/Worker secrets separate, never expose them in build logs, documents or chat, and do not copy live financial/guardian records into local tests.

## Required GitHub/Cloudflare configuration

- **Production secrets:** `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `BETTER_AUTH_SECRET`, `TURNSTILE_SECRET_KEY`; production variable `TURNSTILE_SITE_KEY`; optional `STAFF_EMAIL_FROM` and `RESEND_API_KEY` together with a verified sender.
- **Dev-only secrets:** `DEV_BETTER_AUTH_SECRET` (independent, 32+ characters), `DEV_TURNSTILE_SECRET_KEY`; variable `DEV_TURNSTILE_SITE_KEY`. The provisioner derives the dev host. The widget must allow that exact host. Never reuse production auth or Turnstile secrets.
- **Cloudflare API permissions:** a one-time D1 Delete grant is needed for the owner-authorized mock dev reset. Once completed, remove Delete permission from routine deployment credentials. Use independently scoped production permissions.
- **Public controls:** Turnstile is validated server-side (hostname/action and token verification) for anonymous forms; an absent key blocks sensitive forms, never silently bypasses protection. Enforce HTTP origin, active verified membership, named permissions and staff scope on all protected actions.
- **Notifications:** dev SMS/email must be disabled, sandboxed or allow-listed. Never send tests to real guardians.

## First OWNER / staff setup

Development OWNER must register again after the clean mock-only D1 reset. Issue a fresh one-time setup token in **`sohojac_dev`**, not production, following [DEV_FIRST_OWNER.md](./DEV_FIRST_OWNER.md). Do not copy old authentication rows, credentials or demo passwords. Guardians/students have no ERP login.

## Reusable Subjects — no legacy subject workflow

Every Subject is a single global record in `academic_subjects` (ID, code, title, active). Configure it through Academic Setup → Subjects, alongside Classes and Groups. The guided Programme Launch and advanced website settings select the same records without class/stream filters. Changing a global subject updates linked public-card subject summaries; inactive subjects cannot be newly added.

The clean schema never creates `academy_subjects` or grade-specific subject columns. A one-time `sohojac_dev` rebuild clears mock records and old migration tracking, then initializes four migrations and the reference seed. First-owner onboarding must be repeated after a reset. No old API or mapping screen remains.

## Operational recovery and release evidence

For each deployment, preserve the Actions URL, exact SHA, D1 name/UUID, schema changes, verified bookmark, test outcome and binding proof. Verify the actual dev URL and role-specific workflows with the owner; only then consider a **separate** approved production release. A successful HTTP 200 does not prove live enrollment, ledger reconciliation, SMS delivery or accessibility. Those remain explicit acceptance tasks.
