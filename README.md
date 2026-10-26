# Sohojac — Cloudflare-native coaching operations

New, simplified version of [Sohoj Academy](https://github.com/AbdusSattar-70/sohoj-academy), targeting Next.js on Cloudflare Workers, **one** D1 SQLite database, R2 object storage, and staff authentication (Clerk candidate).

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

See [Product scope and student costing](docs/PRODUCT_SCOPE_AND_STUDENT_COSTING.md). This repository is **not deployed or production-ready**.

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
rejects non-local submissions if Turnstile is missing. Authentication and
staff-only prospect management remain separate work.
