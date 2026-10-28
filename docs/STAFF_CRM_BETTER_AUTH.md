> **Updated deployment process:** Instead of following the manual deployment and owner initialization sections below, use [One-Time Setup + Automatic Deployment](ONE_TIME_SETUP_AUTO_DEPLOY.md). That guide supersedes the old release instructions. GitHub Actions now tests, migrates, safely initializes the first owner and deploys on branch pushes once credentials are configured.

# Sohojac Staff CRM — secure Better Auth + Cloudflare D1

**Status: staged, not deployed automatically.** Public registration remains live
on the existing Worker until the owner completes the manual release below.

This module provides staff sign-in, prospect list/search/status filters,
follow-up notes, and an append-only-by-application audit trail of follow-up
changes. It deliberately does **not** enrol students, create bills, grant staff
accounts, collect payments, or automatically open admission applications.

## Architecture and security

- Better Auth (email/password; server-side sessions) uses **native Cloudflare
  D1**, not Supabase, Clerk, a second database, or guardian accounts.
- Public self-signup is disabled. The first OWNER is created by a one-time
  privileged GitHub workflow with Better Auth's password-hashing function.
  Subsequent staff accounts need an authorized provisioning workflow/UI,
  which is not implemented yet.
- Staff access requires both a **valid verified Better Auth session** and an
  **active `staff_memberships` row** in D1. Roles: OWNER / ADMIN /
  OPERATOR / TEACHER. Only OWNER, ADMIN and OPERATOR may read and update
  prospects; teachers are explicitly denied. Changing a user's auth
  password/account does not grant CRM permissions.
- Every private API request re-queries D1 membership; changing `active`
  to 0 revokes CRM access even if the session cookie is still valid.
- Staff auth routes are restricted to **one exact origin** set by
  `BETTER_AUTH_URL`; `workers.dev`, `www`, and other hostnames cannot
  access it. Initial origin: `https://sohojac.com`. The planned
  `app.sohojac.com` requires a separate custom-domain setup before changing
  this variable. Do not point it to an unconfigured domain.
- Private APIs use no-store responses, validate filter/status/body sizes and
  enforce same-origin PATCH requests. SQL uses parameter binding.
- The update and its audit record are committed atomically with D1 batch.
  The audit records actor user ID, before/after status, optional internal note
  and timestamp; deletion is not exposed over the web. A stale update fails.
- Public enrolments and initial 2026 programme applications remain CLOSED.
- Do not treat the Google search robots exclusion as an access control; all
  private routes enforce authentication and staff authorization on the server.

## Step 1 — Review local CI first

Branch: `feature/staff_crm_better_auth` in `AbdusSattar-70/sohojac`.

Wait for **Public Website Checks** to pass on this branch. The CI test:
- migrates a **local** Miniflare D1 (including the new 0003 migration);
- bootstraps a synthetic owner with a test-only secret;
- proves public self-signup and anonymous prospect API access are blocked;
- signs in via real Better Auth email/password session cookie;
- lists a synthetic enquiry, changes its status and reads the audit record;
- builds Cloudflare Worker and performs a deployment dry-run.

No CI tests read real student or guardian data.

## Step 2 — Prepare GitHub Actions credentials

Open GitHub repository > Settings > Secrets and variables > Actions.

Keep previously configured:
- Secret: `CLOUDFLARE_API_TOKEN` (Workers deploy access)
- Secret: `CLOUDFLARE_ACCOUNT_ID`
- Secret: `TURNSTILE_SECRET_KEY`
- Variable: `TURNSTILE_SITE_KEY`

Add:
- **Secret** `BETTER_AUTH_SECRET`: generate at least 32 random bytes, e.g.
  run `openssl rand -base64 48` locally. This must remain stable across
  deployments; rotating it invalidates existing sessions.
- **Secret** `CLOUDFLARE_D1_API_TOKEN`: Cloudflare API token scoped to this
  account with D1 **Edit** permission. Separate from Workers deployment token.
- **Secret** `SOHOJAC_INITIAL_OWNER_EMAIL`: the email you personally control
  for the first staff account (not an invented or shared address).
- **Secret** `SOHOJAC_INITIAL_OWNER_PASSWORD`: random unique password of
  **at least 16 characters**, stored securely outside GitHub too. Do not put
  it in chats, code, terminal history or workflow inputs.
- Optional **variable** `BETTER_AUTH_URL`: if omitted, it defaults to
  `https://sohojac.com`. Only use an active HTTPS hostname controlled by you.

The initial OWNER email must be an actual inbox you control; the bootstrap
marks it verified without emailing it. Never use an email you cannot access.

## Step 3 — Initialize D1 + first OWNER (exactly once)

The public programmes/enquiries already exist in the ONE D1 database:
`d6f3e4e9-2190-43bf-bc90-969687f6db78`.

1. Review `migrations/0003_better_auth_staff.sql`. The migration adds new
   Better Auth and staff tables, but does not delete public registrations.
2. In GitHub Actions run **Initialize Sohojac Staff CRM (one time)**,
   selecting the default branch (`master`) as the workflow trigger.
3. Enter `INITIALIZE_STAFF_CRM` in the confirmation input. The job checks
   out `feature/staff_crm_better_auth` and applies pending D1 migrations.
4. It refuses to create an owner if ANY auth user or staff member already
   exists; it never silently overwrites accounts.
5. Verify the success message. Delete the two temporary
   `SOHOJAC_INITIAL_OWNER_*` GitHub secrets afterward and remove the
   temporary D1 token if it is no longer required.

If the initialization step fails **after** inserting the user or account,
**do not retry blindly**. Check partial rows in D1; the three provisioning
inserts are separate API calls. Fix the partial state before rerunning.
Never paste password hashes or contact data into an issue or support chat.

## Step 4 — Deploy staff CRM (manual)

Run **Deploy Sohojac Staff CRM (manual)** from the Actions page, triggering
from `master`. It explicitly builds `feature/staff_crm_better_auth`,
requires all Cloudflare, Turnstile and Better Auth secrets, validates
TypeScript, builds and uploads the new Worker. It does not apply migrations
or create users.

**Important:** the older **Deploy Sohojac Public Website** workflow still
targets the old public branch. Do **not** run that older deployment after
the staff CRM release, or it can replace the CRM Worker with the older build.

Because both public and staff modules currently share the `sohojac` Worker,
they are reached via the root host at `https://sohojac.com`.
The proposed `app.sohojac.com` split is a separate future project.

## Step 5 — Verify sign-in and CRM

1. Open `https://sohojac.com/sign-in`, log in with your initial OWNER email
   and password. Do not use the `www` or `workers.dev` hostname for staff.
2. Open `https://sohojac.com/app`, then **Prospect enquiries**.
3. Confirm recent interest registrations appear only after authentication.
4. Try a harmless status/note update on a synthetic or consented test
   enquiry, then expand **View audit trail**. Do not alter real applicants
   merely to test.
5. Log out and try `https://sohojac.com/api/staff/prospects` in a fresh
   private browser window: it must return HTTP 401 and NO personal data.
6. Check that your original public homepage and `/interest` continue to
   work with Turnstile and the D1 catalogue.

## Operational caveats before wider staff rollout

- Keep OWNER access limited. Until a reviewed staff provisioning UI exists,
  do not hand out shared passwords. Do not use D1 SQL to make arbitrary
  unverified accounts.
- Put Cloudflare WAF **rate limiting** on `/api/auth/sign-in/email`
  to slow credential guessing across Worker isolates. Protect the admin
  route with Cloudflare Access as an additional layer if desired, but
  ensure Access does not break Better Auth's login/cookie callbacks.
- Enforce strong passwords and enable MFA/2FA in a follow-up release. This
  first phase does **not** claim MFA support.
- Set a written data retention and deletion policy, staff training and D1
  backup strategy before collecting large amounts of student/guardian data.
- Fee plans, batches, staff invitations, prospect-to-student conversion,
  admissions, and academic modules are **not yet implemented**. Do not
  manually update production enrolment status to work around this.
