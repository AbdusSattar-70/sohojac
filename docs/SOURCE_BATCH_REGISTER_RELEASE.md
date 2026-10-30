# Source Batch Register

Feature branch: `feature/academic-batches-source-parity`.
Dependency: source offerings and immutable Fee Plan migration 0030.

The original Batch page and register are restored. Only the page's read adapter
and the register's lifecycle adapter imports differ from the pinned source;
the source-contract test proves the remaining bytes.

- Academic viewing requires `academics.view`; changes require
  `academics.manage` and a same-origin request.
- The academic workspace returns genuine offering/cohort/capacity/schedule
  information without querying applicant identities, cases, invoices or payments.
- New batches require verified active branch/programme links, an active offering
  and a current effective fee plan. No public display label is inferred as an ID.
- Source CREATE_BATCH/EDIT_BATCH forms use request identities, actor/reason audit,
  optimistic batch revisions, unique codes and capacity checks within the transaction.
- Existing offering/year links are never reassigned by cohort edits. Concurrent
  enrollment prevents shrinking a batch below its actual active enrollment count.
- The current target capacity policy remains 12, matching its existing batch API.
  Original editable business-rule configuration is a separate pending deliverable.
- Inactive source batches map to the existing PLANNED state. Enrollment history
  is retained; completed/cancelled historical states remain closed.
- Public catalogue seat totals now read actual active cohorts and enrollment counts
  instead of stale cached counters. No student identity or payment is public.

Ten tests execute production SQL against baseline migration replay plus 0030,
covering permissions/origin, verified prerequisites, retry conflicts, capacity
races, optimistic revisions, lifecycle history, privacy, rollback and public seat
accuracy. CI loads real installed Zod/admission schemas. Local execution without
node_modules explicitly covers only SQL/permission seams.

CI also checks the original page/register contract, owner-rendered Batch Register
and anonymous/teacher denial. Full repository CI and deployment must pass on the
final feature commit.

Real new-cohort creation retains the source setup prerequisite: verified branch
and academic master records must exist. This feature creates no fake branch,
offering, student, enrollment or financial record in production.
