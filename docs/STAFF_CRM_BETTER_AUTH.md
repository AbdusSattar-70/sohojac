# Sohojac Staff CRM — Better Auth + Cloudflare D1

The active setup/deployment instructions are in
[ONE_TIME_SETUP_AUTO_DEPLOY.md](ONE_TIME_SETUP_AUTO_DEPLOY.md).

**Owner credentials are never stored in GitHub secrets.**
Use **Cloudflare Dashboard → D1 → sohojac → Console** to insert the first
owner's email/name and generate a 30-minute setup ticket. Then open
`https://sohojac.com/setup-owner` and choose an 8-character-or-longer
password in the secure web form. The server hashes it using Better Auth and
writes the user, credential and OWNER membership **directly into existing D1**.
See [the one-time setup guide](ONE_TIME_SETUP_AUTO_DEPLOY.md) for the SQL.

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

Push a commit to `master`. GitHub Actions runs tests,
checks migrations, applies only pending migrations, deploys with the stable
Better Auth and Turnstile secrets, then checks public routes and private API
denial. **CI never creates or changes owner accounts.**

First-owner setup requires a one-time high-entropy code generated in the
Cloudflare D1 Console. The code is consumed transactionally; an existing
Better Auth user prevents a fresh bootstrap. Never paste the owner's plain
password into SQL Console, code, logs or issues.

## Security limitations and operating practice

- This version does not yet provide MFA, password reset delivery, staff
  invitations, programme editing, full student admission, or finance modules.
- Add Cloudflare WAF rate limiting for `/api/auth/sign-in/email` and secure
  your Cloudflare/GitHub accounts with MFA.
- Preserve existing student/guardian data. Use versioned additive migrations
  and a backup strategy. Never reset D1 to recover an OWNER password.
- If one-time owner provisioning partially fails, pause and inspect the DB;
  do not repeatedly rerun or overwrite existing credentials.
