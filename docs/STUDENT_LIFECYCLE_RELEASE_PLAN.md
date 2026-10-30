# Source student lifecycle release

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

Before production, require an exact-hash exception in the migration checker,
a verified D1 Time Travel recovery bookmark, and a successful isolated dev D1
migration/replay. Retain the snapshot tables. A rollback requires a reviewed
recovery plan that accounts for any lifecycle changes made after deployment;
restoring a pre-migration snapshot blindly could lose later legitimate work.

## Verification and scope

`node scripts/test-student-lifecycle.mjs` replays all 28 prior migrations against
populated canonical ledgers before applying 0029 and the immutable Fee Plan
extension. It runs the actual command store against SQLite, including conflicts,
retries, return transfers, verified duplicate history and financial preservation.
`node scripts/test-student-profile.mjs` retains the profile permission/isolation
and complete integer-total checks beyond the latest 200 displayed invoices.

Production acceptance also requires the complete existing-student admission
review, consent, billing, payment and activation path on the real D1 adapter.
This release does not invent missing historic guardian links, birth facts,
refunds, credit balances or Supabase-to-D1 identity mappings. Those require their
own verified source data and domain implementations.
