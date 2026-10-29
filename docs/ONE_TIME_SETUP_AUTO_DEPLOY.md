# Sohojac — one-time setup, then automatic deployments

**One existing Worker:** `sohojac`.
**One existing Cloudflare D1:** `sohojac`, ID
`d6f3e4e9-2190-43bf-bc90-969687f6db78`.

No second database, no public staff signup, no student/guardian accounts.

## One-time step A: set only application credentials in GitHub Actions

Open https://github.com/AbdusSattar-70/sohojac/settings/secrets/actions

Keep the existing public website settings:
- Repository secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
  `TURNSTILE_SECRET_KEY`.
- Repository variable: `TURNSTILE_SITE_KEY`.

**Create ONE new secret for Better Auth**, using your own Ubuntu terminal:

```bash
openssl rand -base64 48
```

Copy the printed random value to GitHub Actions repository secrets, name:
`BETTER_AUTH_SECRET`. **Do not regenerate it on each deployment.**
Do not put it in code or the repo. If you use local development, use
a separate `BETTER_AUTH_SECRET` in your gitignored `.env`.

Cloudflare D1 access uses the **same existing `CLOUDFLARE_API_TOKEN`** for
Worker deployment and D1 migrations. The previous release returned **403**
when directly querying D1: it could deploy the Worker, but lacked permission
to modify the database.

In [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens),
find the existing token and select **Edit**. Ensure the token has both:
- Account → Workers Scripts → Edit (or corresponding current Workers Editor role).
- Account → D1 → Edit.
- Account resources scoped to the account containing `sohojac`.

Save the token permissions. **Do not add a separate D1 token.** If Cloudflare
does not allow modifying this token, create a replacement with both
permissions, then update the value of the **existing GitHub repository secret
`CLOUDFLARE_API_TOKEN`**. Do not paste the token in issues or chat.

**Owner credentials are never GitHub secrets.** The email is set in D1 Console; the password is hashed by the one-time website setup form.

## One-time step B: let CI deploy the schema and app

On the staff development branch, any code push runs
**Public Website Checks → Auto-release to Cloudflare**.

The first ready release:
1. Runs local tests, TypeScript, build and Better Auth integration tests.
2. Applies only pending, reviewed, additive migrations to remote D1.
3. Deploys with the stable `BETTER_AUTH_SECRET` and Turnstile credentials.
4. Verifies the public pages and that unauthenticated CRM access is denied.

The release pauses with a notice if app credentials have not yet been set.
It **does not** create an owner or require the owner password.

View the latest run:
https://github.com/AbdusSattar-70/sohojac/actions

If necessary, use **Re-run all jobs** on a successful code-push workflow
after adding secrets. Or push a normal new commit. Do not run the old manual
deployment workflows; they have been removed to prevent accidental rollback.

## One-time step C: owner email/name in Cloudflare D1, password in website

No terminal bootstrap. **Never place the plain password in SQL.**

Wait for the staff CRM automatic deployment to finish successfully,
including migration `0004_dashboard_owner_setup.sql`. The live public site
will continue running before the new Worker is deployed.

1. Open [Cloudflare Dashboard](https://dash.cloudflare.com/), navigate to
   **D1 → sohojac → Console**.
2. Run this SQL **once**. The email/name are yours to edit if needed:

```sql
INSERT INTO staff_owner_setup
  (id, email, display_name, token, expires_at)
SELECT
  'first-owner',
  'sohoj.aca@gmail.com',
  'Abdus Sattar',
  lower(hex(randomblob(32))),
  strftime('%Y-%m-%dT%H:%M:%fZ','now','+30 minutes')
WHERE NOT EXISTS (SELECT 1 FROM "user")
  AND NOT EXISTS (SELECT 1 FROM staff_memberships);
```

3. In the same D1 Console, execute the next query and copy the generated
   64-character setup code (keep it private):

```sql
SELECT token, expires_at
FROM staff_owner_setup
WHERE id='first-owner' AND consumed_at IS NULL;
```

4. Open **https://sohojac.com/setup-owner**. Paste the setup code,
   choose a password **8–128 characters** and confirm it. Then press
   **Create owner account**. The server hashes the password with Better Auth
   scrypt, and stores the user + credential + active OWNER role transactionally
   in the **same D1 database**. The setup ticket is consumed and never works
   again.
5. Sign in at **https://sohojac.com/sign-in**.

If the 30-minute token expires before you finish, run the following D1
Console query to renew it; this works only when the ticket has not been used
and there are still no auth users:

```sql
UPDATE staff_owner_setup
SET token=lower(hex(randomblob(32))),
    expires_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','+30 minutes')
WHERE id='first-owner' AND consumed_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM "user");
```

Then re-run the SELECT and use the new code. Never email/share setup codes
or passwords, or enter an un-hashed password into the D1 SQL Console.
If a user already exists, do not delete database tables to restart. Use
a separate audited owner recovery process.

## Every future update: only git push

```bash
cd ~/all-projects/sohojac
git switch master
git add -A
git commit -m "feat: update Sohojac"
git push origin master
```

GitHub Actions automatically tests, applies pending D1 migrations and
deploys the Worker, with stable Better Auth and Turnstile secrets.
**It never recreates the owner or touches existing passwords.**

Each new migration must have a new number in `migrations/`. Auto-release
blocks potentially destructive SQL migrations; those need a human-reviewed
migration plan. No live-data reset is performed.

## Additional security

Only OWNER/ADMIN/OPERATOR D1 members can manage prospects. Anonymous users
and TEACHER roles are denied. No public signup is enabled. Keep the OWNER
password in a password manager, protect GitHub/Cloudflare with MFA and apply
rate limiting to `/api/auth/sign-in/email`. The public interest-registration
form and all existing D1 enquiries are retained.

The Better Auth staff hostname is initially `sohojac.com` exactly.
Do not set `BETTER_AUTH_URL=app.sohojac.com` before attaching that domain.
