# Sohojac — configure once, deploy automatically

The application has **one** Cloudflare Worker (`sohojac`) and **one existing**
D1 database (`sohojac`, ID `d6f3e4e9-2190-43bf-bc90-969687f6db78`).
No Vercel, Supabase, second database, or guardian accounts are needed.

## What happens automatically

Every push to **`feature/staff_crm_better_auth`** triggers a **single**
GitHub Actions workflow, **Public Website Checks**, with a release stage:

1. Install dependencies, build, type-check and run integration tests against
   **local D1** (including real Better Auth login and staff authorization).
2. Only if tests pass, check that deployment credentials are available.
   If not, report a **notice and skip deployment**; keep the live site running.
3. Skip deployment when the commit is no longer the latest on the branch.
4. Check migrations for forbidden destructive SQL and build once more.
5. Apply **only pending numbered migrations** to the existing remote D1.
   Applied migrations are tracked and do **not** rerun on each deployment.
6. If an active OWNER already exists, **never** recreate or reset their account.
   For the **first run only**, bootstrap using the one-time owner credentials.
7. Upload the Worker with the persistent `BETTER_AUTH_SECRET` and existing
   Turnstile secret. The GitHub secret is passed securely using a temporary
   file and never checked into code.
8. Check public pages and verify unauthenticated access to
   `/api/staff/prospects` returns HTTP 401.

If tests, migration, bootstrap or deployment fails, the job stops. A release
never intentionally skips required security validation.

## One-time credentials (the only manual setup)

Open [GitHub Actions secrets](https://github.com/AbdusSattar-70/sohojac/settings/secrets/actions).

Already configured for the public site (KEEP them):
- `CLOUDFLARE_API_TOKEN` — Worker deployment token
- `CLOUDFLARE_ACCOUNT_ID`
- `TURNSTILE_SECRET_KEY`
- **Actions variable** `TURNSTILE_SITE_KEY`

Add once:
- `BETTER_AUTH_SECRET` (**secret**): generate locally using
  `openssl rand -base64 48`; keep it unchanged on later deployments.
- `CLOUDFLARE_D1_API_TOKEN` (**secret**): a Cloudflare API token for your
  existing account with **D1 Edit**. You can omit this if your existing
  `CLOUDFLARE_API_TOKEN` already has D1 Edit permission. Never post tokens.
- `SOHOJAC_INITIAL_OWNER_EMAIL` (**secret**): your own working inbox.
- `SOHOJAC_INITIAL_OWNER_PASSWORD` (**secret**): a unique 16–128 character
  password stored in a password manager; never send it in chat.

Optionally set Actions **variable** `BETTER_AUTH_URL`; default is
`https://sohojac.com`. The staff login works only on this exact hostname.
Do not set `app.sohojac.com` until that hostname has been configured as an
active Worker custom domain.

**Initial activation:** After adding the missing credentials, open the latest
successful **Public Website Checks** workflow on
`feature/staff_crm_better_auth` and choose **Re-run all jobs**. Or push a
new commit. The first successful automatic release will initialize the staff
tables/owner and publish Better Auth + CRM.

After the owner account has been successfully created, **delete**
`SOHOJAC_INITIAL_OWNER_EMAIL` and `SOHOJAC_INITIAL_OWNER_PASSWORD` from
GitHub Actions secrets. They are not needed for later deployments, but
`BETTER_AUTH_SECRET` **must remain stable**. The automated bootstrap checks
the active OWNER and safely skips provisioning on subsequent releases.

## Daily workflow: only one push

```bash
cd ~/all-projects/sohojac
git switch feature/staff_crm_better_auth
# ... write and test code ...
git add -A
git commit -m "feat: update CRM"
git push origin feature/staff_crm_better_auth
```

That's all. GitHub tests, migrates and deploys. No repeated login, manual
SQL migration, Cloudflare dashboard edits or `pnpm run deploy`.

When a schema change is needed, add a **new** numbered SQL file under
`migrations/` (never edit an old applied migration). The job checks for
destructive operations and fails closed if detected. Complex or data-destructive
changes require separate review; they are not safe to auto-apply.

## Staff URLs after initial release

- Sign-in: `https://sohojac.com/sign-in`
- Dashboard: `https://sohojac.com/app`
- Prospects: `https://sohojac.com/app/prospects`
- Public interest registrations remain: `https://sohojac.com/interest`

Only a verified signed-in user with an active D1 staff membership can access
private CRM data. Public signup remains disabled. Initial programme admissions
remain closed.

## Safety and recovery

- Auto-release is triggered **only on pushes to the fixed staff-development
  branch**, never on a pull request or other branch.
- Production D1 has **real** prospect information. CI tests a separate local
  database; it never clears, seeds or resets production public enquiries.
- Auto-release uses the SAME D1 binding and Worker; it does not create
  duplicates. Migrations are additive and version tracked.
- GitHub queued older deployments check the branch tip and skip stale commits.
- A successful deployment does not equal tested production user login; verify
  your first sign-in manually once.
- Protect the source branch against unauthorized pushes and enable account
  2FA. Add WAF rate limiting to `/api/auth/sign-in/email`. Full staff MFA and
  production data retention procedures remain future security work.
- Avoid running legacy public-site deployment workflows; they target an
  older application version and could overwrite the new CRM.
- In a failed migration/partial bootstrap, stop and inspect D1. Do not
  repeatedly reset user tables or paste personal data into job logs.

## Where to see deployment status

[GitHub Actions workflow runs](https://github.com/AbdusSattar-70/sohojac/actions)

The same workflow shows **build (tests)** then **Auto-release to Cloudflare**.
A success-with-skip notice means the deployment prerequisites still need
one-time configuration; it is not a production deploy.
