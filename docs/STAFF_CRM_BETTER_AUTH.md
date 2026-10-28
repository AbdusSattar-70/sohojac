# Sohojac Staff CRM — Better Auth + Cloudflare D1

The active setup/deployment instructions are in
[ONE_TIME_SETUP_AUTO_DEPLOY.md](ONE_TIME_SETUP_AUTO_DEPLOY.md).

**Owner credentials are never stored in GitHub secrets.**
Run `bash scripts/setup-owner.sh` interactively from your Ubuntu terminal
once. It prompts for owner email/password and creates the user/credential/
OWNER membership **directly in the existing D1 database**. A secure Better
Auth password hash is stored in D1; plaintext is not retained.

For the app-wide secret, run `openssl rand -base64 48` locally **once**,
then enter its result as the `BETTER_AUTH_SECRET` repository secret in GitHub
Actions. This stays unchanged across deployments.

## Design

- One existing `sohojac` D1 database; no second database or Supabase.
- Better Auth credential login, eight-hour server session, public signup disabled.
- Verified authenticated session **plus active** `staff_memberships` D1
  record required for every private API request.
- Roles: OWNER, ADMIN, OPERATOR, TEACHER. Only the first three may see
  guardian contact records or change prospect follow-up status.
- D1 audit history records before/after status, actor, note, timestamp.
- Public registrations remain unverified prospects. No automatic admissions,
  students, payments, or invoices are created.
- Staff base URL starts at `https://sohojac.com` (not www or workers.dev).
- Search engines are instructed not to index staff routes, but **the actual
  security boundary is session validation and D1 authorization**.

## Automatic releases

Push a commit to `feature/staff_crm_better_auth`. GitHub Actions runs tests,
checks migrations, applies only pending migrations, deploys with the stable
Better Auth and Turnstile secrets, then checks public routes and private API
denial. **CI never creates or changes owner accounts.**

One-time `scripts/setup-owner.sh` is the only process that creates the first
OWNER. Do not run that script from GitHub Actions or pass the owner password
in command arguments, SQL Console, code, logs or issue comments.

## Security limitations and operating practice

- This version does not yet provide MFA, password reset delivery, staff
  invitations, programme editing, full student admission, or finance modules.
- Add Cloudflare WAF rate limiting for `/api/auth/sign-in/email` and secure
  your Cloudflare/GitHub accounts with MFA.
- Preserve existing student/guardian data. Use versioned additive migrations
  and a backup strategy. Never reset D1 to recover an OWNER password.
- If one-time owner provisioning partially fails, pause and inspect the DB;
  do not repeatedly rerun or overwrite existing credentials.
