# Sohoj Academy — master-only production deployment

**Source of production truth:** `master` (GitHub default branch).

- Feature branches and PRs are tested but **never deploy**.
- Merge a PR into `master` only after integration CI succeeds.
- The `master` push CI validates types, D1 migrations, application build,
  public routes, Better Auth and role restrictions.
- After success, the `release` job applies **pending** remote D1 migrations,
  deploys the Cloudflare Worker with existing stable secrets and probes the
  public routes and private API denial (401 for anonymous requests).
- Verify the deployment job ran; a skipped release is **not** deployed.
- The previously used `feature/staff_crm_better_auth` branch is a historical
  release reference, not an auto-deploy target.
- Do not force-push `master`, rewrite applied migrations, introduce live
  synthetic students/payments, or expose privileged routes without auth.

**Current consolidation:** The user requested all current ERP code be merged
to `master` and deployed. All staged modules are in that snapshot, but
the ERP parity tracker documents work still missing. This is not full
production acceptance or a complete legacy ERP replacement.

**Operational caution:** Major schema releases should be preceded by a
verified D1 backup and post-deployment role tests using a real authorized
staff account; GitHub's anonymous health checks cannot prove every
authenticated UI flow.

## Optional staff email delivery

The `RESEND_API_KEY` Cloudflare secret is required **only if** GitHub Actions
variable `STAFF_EMAIL_FROM` is set to a verified sender address. Without
both, the Worker deploys with staff mail deliberately disabled. Staff
invitation/recovery APIs fail closed and do not claim an email was delivered.
Configure both under repository Actions settings before enabling email.
Never enter the provider key in the repository or a chat message.
