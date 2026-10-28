# Public registration: production setup and acceptance checks

This document is for the Sohojac public site on `sohojac.com` and
`www.sohojac.com`. It does not enable staff access or student/guardian accounts.

## Current guarantees

- A submission is an **unverified prospect**, never enrollment, a seat
  reservation, an invoice, or payment acknowledgement.
- Admission applications may only target a published, active, OPEN offering.
  Both seeded 2026 programmes are initially CLOSED.
- The service validates required names, a Bangladesh mobile number, class,
  consent, optional data lengths, request origin and Turnstile siteverify.
- Turnstile validation checks **success, action, and request hostname** and
  has an 8-second timeout. Each challenge token can be used once.
- A duplicate mobile submission within one minute receives HTTP 429.
- Failed/unconfigured registration returns a user-friendly message; **no
  unverified record is written**.
- After a successful insert, a printable acknowledgement contains the generated
  reference. It is **not** proof of admission.

## Configure Turnstile + production CI credentials

1. In Cloudflare, create a Turnstile widget. Allow BOTH hostnames:
   `sohojac.com` and `www.sohojac.com`. Do not use the `workers.dev`
   diagnostic URL for public personal-data collection.
2. In the **GitHub repository** `AbdusSattar-70/sohojac`:
   - Settings > Secrets and variables > Actions > **Variables**:
     add `TURNSTILE_SITE_KEY` as the public widget site key.
   - Settings > Secrets and variables > Actions > **Secrets**:
     add `TURNSTILE_SECRET_KEY` as a repository secret.
   - Keep the existing `CLOUDFLARE_API_TOKEN` and
     `CLOUDFLARE_ACCOUNT_ID` secrets.
3. After `Public Website Checks` passes on the
   `feature/public_site_port` branch, run **Deploy Sohojac Public Website**
   manually from GitHub Actions. Select `master` for the workflow trigger;
   the job itself checks out `feature/public_site_port`.
4. This workflow binds `TURNSTILE_SITE_KEY` as a text variable and securely
   uploads `TURNSTILE_SECRET_KEY` via a temporary secrets file. The file is
   removed when deployment completes. Never log or commit either secret.
5. Check `https://sohojac.com/interest`. The challenge should appear and
   the "security verification is being configured" notice should disappear.
   Repeat on `www` if that hostname serves directly instead of redirecting.
6. Keep `sohojac.com` the canonical host for SEO.

**Important cf beta behavior:** Older `cf deploy` versions may not retain
dashboard-only secrets reliably. This project therefore declares
`TURNSTILE_SECRET_KEY: bindings.secret()` in `cloudflare.config.ts` and
supplies it afresh for every *manual CI deployment*. Dashboard-only edits
are not the preferred source of truth. See the Cloudflare CLI `cf` issue
about dropped secrets (#70).

If either value is missing, the deploy job fails before the upload step,
and the registration form remains disabled in the current deployment.
The API also returns 503 on non-localhost submissions when the secret is
missing. This is intentional, not a form bug.

## Existing D1 database

Existing D1 UUID: `d6f3e4e9-2190-43bf-bc90-969687f6db78`.
Do not create a new database. Both numbered migrations have been reported
as applied remotely by the owner.

Verify in **Cloudflare D1 > sohojac > SQL Console**:

```sql
SELECT code, application_state FROM public_programme_offerings;
SELECT COUNT(*) AS enquiry_count FROM public_enquiries;
```

No personally identifying contact information should appear in screenshots,
issues or logs. Never expose `public_enquiries` through an unauthenticated GET.

## Live acceptance test (after Turnstile configuration)

1. Submit a **consensual test enquiry** on the public page using a contact
   number you control. Select 'general interest' rather than a closed admission
   programme, and mark the test name clearly (e.g., `Test — Site Check`).
2. Confirm one acknowledgement reference is displayed and can be printed.
3. Check the database's latest references (no personal data printed):

```sql
SELECT reference, status, submitted_at
FROM public_enquiries ORDER BY submitted_at DESC LIMIT 5;
```

4. Attempt to submit the same mobile number again immediately. The form
   should display a temporary wait/rate-limit error. After the failed
   attempt, the Turnstile widget must reset for another try.
5. Check both hostnames and mobile layouts. If a domain is redirected,
   the destination must be the canonical domain before submission.
6. If registration fails, inspect Worker runtime logs **without exposing**
   student details or Turnstile secrets, check variable names and confirm
   the widget hostnames.

## Development and CI

`feature/public_site_port` runs GitHub Actions on pushes. CI tests
TypeScript, Worker build, local D1 migration, the public routes and API
persistence, duplicate suppression, closed admissions and invalid requests.
It is NOT a substitute for the live Turnstile test above.

Local development uses gitignored `.env`, not `.env.local`.
Only use test credentials in local environments; do not commit secrets.

The production deployment is **manual-only** through GitHub Actions:
`Deploy Sohojac Public Website` on the repository's default branch. The
workflow checks out `feature/public_site_port`. Do not trigger the
deployment until the branch's Public Website Checks workflow passes.

## Operational boundaries

The staff portal and Better Auth are unfinished. There is no authorized
enquiry review UI yet. Staff should use authorized Cloudflare dashboard
access for verification, and must handle submitted student/guardian data
privately. Provide a data retention/deletion policy before collecting many
real applications. Follow-up messaging and SMS are not implemented.
