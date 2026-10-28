> **Development deployment:** One-time cloud credentials, then just push code. See [Sohojac Auto-Deploy — One-Time Setup](docs/ONE_TIME_SETUP_AUTO_DEPLOY.md). Tests, pending D1 migrations and Worker upload run automatically on pushes to `feature/staff_crm_better_auth`. The first OWNER is created separately and securely in remote D1 with one interactive terminal command; never store owner credentials in GitHub. The live site is unchanged until application deployment credentials are provided.

# Sohojac — Cloudflare-native coaching operations

New, simplified version of [Sohoj Academy](https://github.com/AbdusSattar-70/sohoj-academy), targeting Next.js on Cloudflare Workers, **one** D1 SQLite database, R2 object storage, and staff authentication (Better Auth).

## Domains
- `sohojac.com`: public website, programmes, interest and admission applications without guardian accounts.
- `app.sohojac.com`: authorized admin/office/teacher portal.

## Product principles
- Simple coaching centre, not a general accounting ERP.
- Keep CRM, admissions, student/guardian register, offerings, batches, timetable, attendance, tests/results, progress reports, tuition collection, teacher pay and operating expenses.
- First-class **monthly per-student unit economics**: earned tuition, discounts, variable teaching/material cost, allocated fixed overhead, contribution and operating surplus; report **collected cash separately**.
- Only one D1 database. Protect uniqueness, permissions, audit and monetary integrity.
- Free-tier-first but operational correctness takes priority. R2 stores documents, D1 stores metadata.
- Preserve the existing public website visual identity; document and test business rules before porting.

See [Product scope and student costing](docs/PRODUCT_SCOPE_AND_STUDENT_COSTING.md). The public website is deployed; the private staff CRM remains staged until its one-time owner initialization and manual deployment are completed.

## Public website port (current implementation branch)

See [Public site migration and local D1 setup](docs/PUBLIC_SITE_PORT.md).

The `feature/public_site_port` branch includes the Sohoj Academy homepage,
About, FAQ, Learning Journal, bilingual controls and original images/favicons;
a D1-backed programme catalogue; and a registration/acknowledgement flow.
Public submissions are unverified prospects, not admissions. Programme
applications start closed.

```bash
git switch feature/public_site_port
pnpm install
cp -n .env.example .env
pnpm run cf-typegen
# Apply both SQL migrations to local D1 first, per the linked setup guide.
pnpm run dev
pnpm run build
```

**Do not expose the enquiry endpoint publicly until its D1 migrations and
Cloudflare Turnstile site key + secret are configured.** The server deliberately
rejects non-local submissions if Turnstile is missing. A Better Auth staff CRM is implemented on the `feature/staff_crm_better_auth` branch, but it is not activated automatically. Follow [the secure staff CRM runbook](docs/STAFF_CRM_BETTER_AUTH.md) to configure secrets, initialize the first owner and deploy only after tests pass.

## Staff CRM (staged)

The `feature/staff_crm_better_auth` branch adds Better Auth sessions, explicit
active D1 staff memberships, a role-gated prospect dashboard, follow-up status,
internal notes and audited updates. **Public signup remains disabled.**

See [Staff CRM security, initialization and release guide](docs/STAFF_CRM_BETTER_AUTH.md).
The CRM release is automatic **after the one-time application secret is configured**. Create the first OWNER separately using `bash scripts/setup-owner.sh`, which writes to D1 without storing owner credentials in GitHub. See the auto-deploy guide instead of using older manual deployment workflows.
Do not run the older public-site deployment workflow after the staff CRM is live.
