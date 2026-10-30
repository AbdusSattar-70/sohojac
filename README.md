# Sohojac

Cloudflare-native Sohoj Academy public website and staff ERP. The original
`sohoj-academy` workflows are being migrated to Workers/D1 and Better Auth.
The ERP is English-only, dark, and rooted at `/dashboard`; public registration
requires no student or guardian account.

- [Development strategy and phase status](docs/DEVELOPMENT_STRATEGY.md)
- [Operations, security, configuration and recovery](docs/OPERATIONS.md)

`master` automatically releases production after successful checks; `dev` releases
to a separate Worker using the SAME `sohojac` D1, as requested for development. Feature PRs run checks without deploying production.
A successful build is not proof of full original-ERP parity or staff acceptance.

Use Node 24 and the pinned pnpm version. Local commands:

```sh
pnpm install --frozen-lockfile
pnpm run cf-typegen
pnpm exec tsc --noEmit
pnpm run build
```

See the runbook before applying migrations or configuring auth/Turnstile. Never
commit secrets. Both deployments share data; dev releases add clearly labelled repeatable TEST records without resetting existing accounts.
