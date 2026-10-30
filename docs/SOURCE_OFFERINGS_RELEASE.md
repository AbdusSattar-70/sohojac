# Source Programme Offerings and Fee Plans

Pinned source: `sohoj-academy@f46b61611edce0a82f69e349bb89269329233b62`.

This feature restores the original Programme Offerings and Fee Plans pages,
registers and forms. D1 actions retain their academic-context, publication,
component, discount-policy and lifecycle workflows.

## Preserved records and behavior

- `public_programme_offerings` is the canonical catalogue. Existing slug IDs,
  public content and enquiry/admission references remain attached.
- Academic links are never inferred from display labels. Existing unlinked
  offerings remain explicitly unlinked until authorized staff choose verified
  branch, programme, year and class records.
- School/coaching require a year and class. Training permits optional year/class
  and requires a valid course date range. Context is locked once linked offerings
  have active history; concurrent batch creation is checked within the update.
- Fee publishing creates a new immutable row in canonical `academy_fee_plans`,
  with complete component rows and an actual `source_version`. Legacy rows keep
  null source-version/effective-date metadata rather than invented history.
- Integer paisa aggregates populate the existing per-cycle/one-time amount
  columns, so current admissions and historical fee references remain compatible.
- Publication retires previous current fees atomically and preserves all original
  terms. Database triggers prevent legacy APIs from rewriting published terms or
  components, reactivating retired versions or creating parallel legacy current
  plans after source publishing.
- Academics viewers do not query financial terms without `finance.view`.
  Mutations require original named permissions, same-origin requests, bounded
  schemas, request identities, optimistic revisions and actor/reason audit.
- Public controls retain original source UI and now support the actual stable
  D1 subject IDs. Subject links and public JSON update in the same transaction.
- Retiring an offering closes public visibility/intake; reactivation requires
  an effective current fee plan.

## Validation

The source contract verifier proves the two page Git blobs and discount-policy
component byte-for-byte. It proves the original business schema byte-for-byte
after removing only reviewed stable-ID and concurrency metadata adaptations.

Thirteen tests execute production commands and SQL on a real SQLite replay of
all baseline D1 migrations plus migration 0030. They cover named permissions,
verified context, legacy identity preservation, retry identity conflicts,
concurrent batches/fee changes, immutable fee history, subject publication,
discount policy, lifecycle and transaction rollback. In CI they use installed
real Zod schemas; a local environment without node_modules explicitly exercises
SQL/permission seams only.

The staged CI workflow also checks owner rendering of the original pages and
anonymous/teacher denial. Full CI and dev/production release must be verified
on the final pushed commit.

## Setup prerequisite and remaining scope

Real offering creation requires a verified branch record. Academic settings now
includes the byte-exact original AcademyIdentityForm. Staff with
`system.settings.manage` confirm academy and main-campus names; the D1 adapter
creates the MAIN branch only on that explicit action, retains its permanent ID
on rename, and commits identity, branch, linked display names and audit together.
No identity or campus is seeded. Four SQLite tests cover authorization, origin,
validation, permanent identity/retries and audit-failure rollback. This restores
the offering prerequisite; the full source setup checklist is separate work.

This feature is not the full academic migration. Original batches, planning,
curriculum, timetable, sessions, homework, assessment and progress/document
workspaces remain separate source-first deliverables.
