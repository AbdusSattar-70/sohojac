# Original Sohoj Academy permanent staff identities

## Source contract
The original `supabase/migrations/01_platform_identity_access.sql`
defines `staff_no_seq` and `generate_staff_no()`:
`'SA-STF-' || lpad(nextval(...)::text, 6, '0')`.
It yields `SA-STF-000001`, `SA-STF-000002`, etc.
The source `staff` entity is distinct from auth users; an employee does
**not** require a login account to get a permanent staff identity.

## Cloudflare D1 implementation
- `0024_staff_master_identity.sql` introduces `academy_staff`, a
  canonical staff register independent of Better Auth memberships.
  `staff_seq INTEGER PRIMARY KEY AUTOINCREMENT` is the concurrency-safe
  allocator; `staff_no` is a stored, unique, automatically generated
  derived value. This avoids any MAX+1 race or editable identifier field.
- Existing Cloudflare `staff_memberships` are backfilled in stable
  membership-creation order. Future verified owner/invite account
  activations auto-create staff identity via a D1 trigger **in the same
  transaction**, avoiding partial onboarding.
- A standalone staff register allows an authorized owner/admin to add an
  employee **without creating a login**. Such a record receives an ID
  automatically and is audited. No student/guardian login exists.
- Permanent staff IDs display on `/dashboard/account`, the original
  ERP sidebar, `/app` staff sidebar, and the owner/admin staff register.
- Deleting a user does not delete their historical staff record.
  A staff whose employment status is not ACTIVE or ON_LEAVE cannot
  authenticate to ERP through that record.

## Migration caveat
Existing **Cloudflare** memberships can be safely backfilled, but their
assigned new sequence numbers do not prove equivalence to individual
historical **Supabase** staff records. A verified export/crosswalk of
`staff.id,staff_no,profile_id` is needed to preserve *the same person's*
old number during a full data migration. Never match by email/name alone,
bulk overwrite staff numbers, or assume legacy staff numbers were unused.

## Acceptance
CI verifies owner `SA-STF-000001`, teacher `SA-STF-000002`,
manual no-login employee `SA-STF-000003`, account-count unchanged
by manual staff creation, anonymous/teacher access denial, and
retained staff/audit records. Existing academic workflows remain intact.
