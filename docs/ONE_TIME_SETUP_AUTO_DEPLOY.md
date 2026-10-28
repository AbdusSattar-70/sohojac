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

Cloudflare D1 access: `CLOUDFLARE_API_TOKEN` can be reused for migrations
if it includes D1 Edit permission. Otherwise add one D1-scoped
`CLOUDFLARE_D1_API_TOKEN` secret once. The Cloudflare account ID is already
configured.

**Do not add `SOHOJAC_INITIAL_OWNER_EMAIL` or
`SOHOJAC_INITIAL_OWNER_PASSWORD` to GitHub.** Owner credentials belong
only in Cloudflare D1, not GitHub Actions.

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

## One-time step C: create the first OWNER directly in D1

On your Ubuntu laptop:

```bash
cd ~/all-projects/sohojac
git fetch origin
git switch feature/staff_crm_better_auth
git pull --ff-only origin feature/staff_crm_better_auth
pnpm install --frozen-lockfile
bash scripts/setup-owner.sh
```

The interactive script prompts for:
- Owner email (a working inbox you control).
- Owner display name.
- Password of at least 16 characters, entered twice **without echo**.
- A final `CREATE OWNER` confirmation.

It verifies the migrations, applies only pending ones to your existing
**remote** D1, and creates the three related records:
- Better Auth `user` (email).
- Better Auth `account` (password hashed using `better-auth/crypto`).
- `staff_memberships` (`OWNER`, active).

**The email and password are not added to GitHub, .env, files, or logs.**
The cleartext password is used only in the interactive setup process.
The database stores a salted hash, never cleartext.

If an active OWNER exists, the script refuses to replace them. If a partial
user record exists, it refuses and requires manual inspection; don't wipe
D1 or repeat blindly.

`cf` login: your local Cloudflare CLI must be authenticated.
If it is not, run `pnpm exec cf auth login` and retry the script.
If your ISP blocks Cloudflare API uploads, use a different network. Do not
send passwords or hashes to support/chat.

Once setup succeeds, visit:
- https://sohojac.com/sign-in
- https://sohojac.com/app/prospects

## Every future update: only git push

```bash
cd ~/all-projects/sohojac
git switch feature/staff_crm_better_auth
git add -A
git commit -m "feat: update Sohojac"
git push origin feature/staff_crm_better_auth
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
