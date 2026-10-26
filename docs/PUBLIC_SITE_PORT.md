# Sohojac public website — source port and setup

Source of truth for the visual identity and copy:
`AbdusSattar-70/sohoj-academy` branch `feature/sohoj_final`.
Target: `AbdusSattar-70/sohojac` branch `feature/public_site_port`.
The original repository has not been changed.

## Implemented

- Direct source port of the home, about, FAQ and learning-journal pages.
- Original bilingual (English/Bangla) text, language switch, navigation,
  logos, home photos, learning-method layout, dark palette and card styles.
- Original programme-card React layout, now querying Cloudflare D1, not Supabase.
- Interest/admission landing page based on the original, with a Cloudflare
  D1-backed form (student, guardian, class, school, subjects, schedule,
  preferences, consent) and a printable reference acknowledgement.
- D1 migrations for public offerings and enquiry prospects.
- Initial 2026 catalogue entries using the academy's programme descriptions.
  Admissions are **closed by default**; no seats or fee plans are invented.
- Privacy notice, robots, sitemap and original favicons.
- Cloudflare Turnstile client widget + mandatory server verification when
  configured. On non-localhost hosts, submissions fail closed if there is no
  Turnstile secret, preventing an unprotected form from operating publicly.
- All form submissions are **prospects only**. No student ID, enrollment,
  billing, payment confirmation or seat reservation is performed.
- Public visitors do **not** need accounts.

## Checkout

```bash
cd ~/all-projects/sohojac
git fetch origin
git switch feature/public_site_port || git switch --track origin/feature/public_site_port
git pull --ff-only origin feature/public_site_port
pnpm install
cp -n .env.example .env
```

Fill in the relevant keys in the gitignored **`.env`**. Do not put actual
secrets in the repository or in a chat transcript. Do not use `.env.local`
for this project. Keep an existing `.env` rather than overwriting it.

## D1: use ONE existing database

**Database name:** `sohojac`

**Database UUID:** `d6f3e4e9-2190-43bf-bc90-969687f6db78`

The Worker binding is declared as `DB` in `cloudflare.config.ts`.
This is the same database planned for future Better Auth and academy modules.
D1 locally simulated state is separate from remote production data.

For your installed Cloudflare CLI, inspect supported flags first:

```bash
pnpm exec cf d1 migrations apply --help
```

Apply **locally** and inspect the resulting tables:

```bash
DB=d6f3e4e9-2190-43bf-bc90-969687f6db78
pnpm exec cf d1 migrations apply "$DB" --local
pnpm exec cf d1 raw "$DB" --sql "SELECT code, name, application_state FROM public_programme_offerings" --local
```

Both numbered migrations in `migrations/` must apply in order. If your
installed beta `cf` doesn't yet support migrations, **do not paste SQL in
random tables**: upgrade the CLI or use the documented Wrangler D1 migration
tool targeting the existing DB.

Test the public site and the POST endpoint against the local database:

```bash
pnpm run cf-typegen
pnpm run build
pnpm run dev
```

Open `http://localhost:5173`, then check `/about`, `/faq`,
`/journal`, `/interest`, `/privacy`, `/sitemap.xml`, `/robots.txt`.
Use a test contact number when exercising the local enquiry form; keep
real student information out of test environments.

**Only after local tests pass**, apply the same migrations to the remote
D1 database (which currently has no tables):

```bash
pnpm exec cf d1 migrations list "$DB"
pnpm exec cf d1 migrations apply "$DB"
pnpm exec cf d1 raw "$DB" --sql "SELECT code, application_state FROM public_programme_offerings"
```

Those commands touch **remote production**, unlike `--local`. Confirm your
Cloudflare account and DB ID first. Application state remains CLOSED after
these migrations.

## Turnstile

Create a Cloudflare Turnstile widget for the site's allowed hostnames.
Locally add these to `.env`:

```dotenv
TURNSTILE_SITE_KEY=<public site key>
TURNSTILE_SECRET_KEY=<private secret>
```

In production configure the **site key** as a Worker variable and the
**secret** as a Cloudflare Worker secret, rather than copying your local
`.env` to production. Siteverify is mandatory for non-local submissions.
Do not expose the production enquiry form before Turnstile is ready.

## Known integration limits / next validation

- React source and copy are ported, but **pixel-level browser comparisons**
  against the original at desktop/mobile sizes have not been performed here.
- The original interest form read academic master data from Supabase. The D1
  replacement currently uses fixed class/subject choices and free-text school
  input, not the full academic master-data database.
- The original offered more admission-only fields and workflow. The new
  public page intentionally collects fewer sensitive fields and does not
  yet enroll a student.
- Public offerings are seeded as CLOSED. Staff can later publish application
  intake dates and verified fee plans through authorized D1-backed ERP tools.
- Better Auth sign-in and the staff administration UI are **not yet ready**.
  Never expose `public_enquiries` through an unauthenticated read endpoint.
- Cloudflare secrets, production deployment, form submissions, responsive
  comparisons and CI remain to be verified in the target environment.
