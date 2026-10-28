# Better Auth + Cloudflare D1 (vinext)

This experimental scaffold lives on `feature/better_auth`, created from clean
`master` (NOT from the Clerk experiment). Public site remains accessible.

- Better Auth database: **same D1 binding** used by future Sohojac tables.
- Registration disabled: only pre-provisioned staff accounts can sign in.
- `/app` verifies an authenticated session only; **does not authorize any
  access to private records**. D1 staff membership checks must precede ERP APIs.
- No keys or passwords should be committed to Git.

## Install and test

```bash
git fetch origin
git switch feature/better_auth || git switch --track origin/feature/better_auth
git pull --ff-only origin feature/better_auth
pnpm install
```

Copy `.env.example` to `.env`, then set `BETTER_AUTH_SECRET` (random 32+ character secret) and
`BETTER_AUTH_URL=http://localhost:5173` locally. `.env` is gitignored. With the Cloudflare Vite
plugin, make these values available as Worker runtime environment variables,
not just Vite client env values. Configure production Worker secrets and base
URL on deployment.

Provision the **single D1 database** and apply Better Auth schema **before**
testing sign-in. Do not enable public self-registration just for testing.
Better Auth migration tooling can generate the auth tables, but database
schema generation against a live Worker binding may require an offline config
or a dedicated migration step. Do not run migrations inside normal requests.

```bash
pnpm run cf-typegen
pnpm run dev
pnpm run build
```

Verify public `/`, `/api/auth/get-session`, and `/app` redirects.
Testing authenticated sign-in requires a securely provisioned staff account;
account bootstrap/invitations and D1 staff authorization are next milestones.

This code is **not yet locally built or Worker-deployed**. Confirm the runtime
binding, auth schema and generated types before putting it in production.
