# Programme Offerings — exact-source migration

Source: `AbdusSattar-70/sohoj-academy`,
`feature/sohoj_final`; source schema blob `da68ef71bc0b0a9574710b824c591ba2bcc04375`.

## What this slice implements
- The **unchanged original** `modules/offerings/schema.ts` input contracts
  (academic context, fees, public presentation, application windows).
- A **non-destructive extension** of the existing
  `public_programme_offerings` D1 catalogue with optional branch/year/
  class/programme/group references. Adds a canonical academy branch register.
- A permission-guarded **read-only D1 relationship audit** in
  `modules/offerings/d1-contract.ts` that reports missing link identifiers
  without guessing from display strings. Existing offerings and public
  application status are not changed.

## Work still required to call offerings migrated
1. Port original `OfferingRegister`, `OfferingForm`, public-controls
   forms, subject links and fee components from source, not a redesign.
2. Add deliberate branch/year/class/group/programme linking with
   explicit verification for historical records; **do not** auto-map names.
3. Reconcile legacy `academic_subjects` and `academy_subjects` before
   exposing source subject selection. Currently these are separate D1
   catalogues. No relational writes are permitted through this phase.
4. Preserve finance accounting and fee-plan version semantics, including
   money in integer paisa and audits, before enabling public editing.
5. Exercise authenticated create → edit → public controls → billing →
   application-window integration and role-denial tests, then promote
   the original `/dashboard/academics/offerings` UI.

The source's full schema does not imply its server actions are implemented.
This is an **isolated, read-only foundation**, not an operator-ready feature.

## Resolved dev integration
The dev integration keeps the original source contract **except** for explicitly
accepting existing Cloudflare public offering slug IDs. The source contract
script normalizes that known compatibility adaptation and verifies the pinned
original Git blob; production catalogue IDs must never be rewritten to UUIDs.
