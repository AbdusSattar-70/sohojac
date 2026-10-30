# Student profile and history release

Source: `sohoj-academy@f46b61611edce0a82f69e349bb89269329233b62`,
`app/dashboard/students/[studentId]/page.tsx` (blob `3b64914b876f0834bc3963962462aa069040457a`).

The existing Student Register linked to a missing profile route. This release restores
that route using the original identity, guardian, admission, enrollment and financial
section layout with a read-only D1 adapter at the original lifecycle query path.

- `students.view` is required by both the route and its data adapter.
- Identity and guardian contacts come from `academy_students`; enrollments come
  from `academy_enrollments`. Prospects are never treated as students.
- Admission case details and links additionally require `admissions.view`.
- Invoice SQL executes only with `finance.view`. Financial history includes
  ISSUED, PARTIAL and PAID invoices belonging to the selected student.
- The latest 200 posted invoices are shown. Window aggregates cover every posted
  invoice for that student and sum integer paisa before display conversion.
- Malformed and unknown student IDs return 404 after authorization.
- Existing register links now open the profile. There are no new financial or
  student mutations, migrations, accounts or live sample records.

This is an intermediate read-only release. Original transfers, existing-student
re-enrollment, duplicate-identity review/merge, guardian history, credits/refunds,
fee-version history and full lifecycle commands remain pending. Unsupported
controls and unsupported facts are omitted; no canonical-identity or historical
data is inferred from names or application snapshots.

Staged CI validation includes authenticated HTTP profile rendering after a synthetic local
admission/enrollment, anonymous/teacher denial, students-only access, immediate
grant revocation, missing IDs, and SQL isolation/totals tests with more than 200
invoices. Full repository CI must pass before merging; dev deployment and smoke
checks precede production promotion through master.

Status: prepared locally, with seven query tests passing. Full build, real HTTP
integration CI and deployment remain pending. The branch-creation call was canceled
and the named feature branch was confirmed absent. Intended release order is
admissions lifecycle hardening, then this feature.
