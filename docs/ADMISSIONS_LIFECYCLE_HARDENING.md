# Admissions lifecycle hardening — prepared for release

Production baseline reviewed: `ced2853a3a70e662602ca1005326e5aca38a298b`.

The canonical five-step admission workflow is deployed, but two admission gaps
prevent treating the module as complete:

1. Legacy mutation endpoints accepted a consent boolean and activated an
   enrollment before payment, bypassing the current paper-consent, fee-review
   and payment workflow.
2. Finalization calculated charge and discount totals before its transaction.
   Concurrent fee edits could leave an invoice inconsistent with the saved review.

## Changes

The four legacy write methods now return authenticated HTTP 410 with a link to
the admission workspace: POST `/api/staff/admissions`, PATCH
`/api/staff/admissions/[id]`, and POST to its `bill` and `enroll` subroutes.
Anonymous, unauthorized and cross-origin requests remain denied. Historical GET
reads and the canonical `[id]/workflow` endpoint remain available. Cached clients
must use the workspace; old writes cannot create new legacy cases.

Finalization validates the live discount, charge total, current offering policy,
latest fee plan, consent revision and case state before the first write in the D1
batch. Subsequent writes depend on successful prior writes. A conflicting review
produces no student, invoice, sequence reservation or misleading audit. Fee
changes keep the identity revision so they do not invalidate signed consent.

## Validation

- 12 focused SQLite tests run the actual production lifecycle functions and SQL,
  exercising concurrent charge/discount/policy/plan/case changes, retries,
  trigger effects and full rollback.
- Retired-route runtime tests verify authentication, role/origin/ID guards and
  fail-closed responses without consuming request bodies or calling D1.
- CI replaces old successful bypass tests with explicit retirement checks and a
  clearly historical local fixture for existing collections/attendance regressions.
  The canonical admission workflow integration tests remain.
- No new migrations, production records or credential changes.

## Release status

The feature is committed on `feature/admissions-lifecycle-hardening` for CI review.
The workspace proxy also prevents a full local dependency install/build.
Full repository CI, isolated dev deployment and production promotion remain
required; the focused local tests are not a substitute for those checks.

Intended branch: `feature/admissions-lifecycle-hardening`.
The separate next feature, `feature/student-profile-history`, repairs missing
student profile links after these admission fixes are released.

Full original admission acceptance still requires browser-driven mutation tests,
historic identity/payment reconciliation and signed-paper records.
