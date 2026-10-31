# Source student lifecycle release

> **Historical identity / migration preservation record.** Source and recovery constraints below are retained as evidence. The current isolated D1 deployment state, four-file development baseline and promotion policy are defined in [DEVELOPMENT_STRATEGY.md](./DEVELOPMENT_STRATEGY.md) and [OPERATIONS.md](./OPERATIONS.md). Do not run old migrations or resets from this file.

Source: `sohoj-academy@f46b61611edce0a82f69e349bb89269329233b62`,
`student_command`, `student_profile_workspace`, `close_student_enrollment`
and the student branch of `record_lifecycle_command`.

## Resulting behavior

- Existing-student enrollment creates a reviewed draft using the permanent
  Student ID and a pinned Fee Plan. It creates no payment or reserved seat.
- Transfers retain the closed enrollment, create another enrollment and record
  authorized transfer evidence. Fees, invoices, receipts and marks keep their IDs.
- Placement enforces the existing twelve-seat policy even for older stored
  capacities above twelve. Independent yearless training offerings use separate
  course identities instead of being grouped under an invented academic year.
- Withdrawal/completion closes the active enrollment and admission. The student
  becomes inactive only when no other active enrollment remains. Existing dues
  and payments are unchanged; future recurring billing must select active enrollments.
- Ordinary state changes use ACTIVE/INACTIVE. ARCHIVED is reserved for verified
  duplicate resolution, with confirmation and matching name or guardian contact.
  Original identities and every historical financial record remain separate.
- Profile history follows verified canonical links. Financial and admission
  details retain their named permission checks. Matching contacts are suggestions,
  never automatic proof that two people are the same student.

## Migration 0029 review

The old inline uniqueness constraints prohibit the original repeat-enrollment
and transfer workflows. SQLite requires rebuilding the canonical student,
admission and enrollment tables to relax those constraints and add source states.
No applied migration is edited and no alternate canonical ledger is introduced.

The migration first copies every existing row into immutable `_pre_0029`
snapshots. It copies all original columns into the replacement tables, restores
indexes and assessment guards, and checks both directions of row equality plus
the complete foreign-key graph. Failed CHECK assertions abort the transaction.
Foreign-key enforcement remains enabled. Deferred counters from rebuilt parent
tables are reset only after the exact preservation and FK assertions succeed.

The checker now admits only SHA-256
`9f7796f6ca25a07e20d1d8f44fc9f842fb8a55756fd78f7593d9bc4f384d6436`
for this reviewed rebuild. Both deployment jobs capture a verified D1 Time
Travel recovery bookmark and retain it as a seven-day Actions artifact before
migrations; a missing bookmark blocks the release. Production still requires
the previously verified isolated migration replay. The later user decision now uses one shared development D1; current dev releases are not data isolation. Retain the snapshot tables. A rollback requires a reviewed
recovery plan that accounts for any lifecycle changes made after deployment;
restoring a pre-migration snapshot blindly could lose later legitimate work.

## Verification and scope

`node scripts/test-student-lifecycle.mjs` replays all 28 prior migrations against
populated canonical ledgers before applying 0029 and the immutable Fee Plan
extension. It runs the actual command store against SQLite, including conflicts,
retries, return transfers, verified duplicate history and financial preservation.
`node scripts/test-student-profile.mjs` retains the profile permission/isolation
and complete integer-total checks beyond the latest 200 displayed invoices.

The admission finalizer now reuses the explicitly linked permanent Student ID,
skips student number allocation, and retains fee/consent/concurrency guards.
Two additional actual-SQL tests cover permanent identity, exact retry, fee races
and rejection of unverified/archived identities. Student state controls now
dispatch to the permission- and origin-checked lifecycle adapter. Closed
admissions no longer block a later same-year return when no active enrollment
remains.

The populated-migration integration suite now exercises existing-student draft,
reviewed consent, final billing, unpaid activation denial, payment retry and
paid enrollment using the actual SQL adapters; historical financial IDs and the
permanent student number remain intact. Authenticated HTTP CI and real dev
D1 migration/deployment remain required before production.
This release does not invent missing historic guardian links, birth facts,
refunds, credit balances or Supabase-to-D1 identity mappings. Those require their
own verified source data and domain implementations.
