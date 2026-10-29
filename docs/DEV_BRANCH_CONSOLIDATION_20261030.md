# Development branch consolidation — 30 October 2026

Current development baseline: `9e6c3b06ab6987897b81bc7485ac58b70070bbb5`.
Production `master` intentionally remains at `46b938bab1b3a7667b0d7df4ecd6fd8aec1cabbe`.

## Conflict-resolution policy

All nine historical source branches have **zero branch-only file paths** when compared to dev. Existing dev implementations are retained as the tested, newer versions; old branches are merged as additional parents to preserve exact commit ancestry. This is an **ours** merge for overlapping files, not an assertion that all old alternate implementation details are restored. Current source-first ERP functional parity remains incomplete, especially admissions.

## Historical source branches incorporated

- `feature/erp-dark-only-staff-mail-setup` @ `d66af6f3804dd5e912a4cbc5f3d432ed9f6c64d5`
- `feature/legacy-staff-number-parity-20261029` @ `bb63bc2f2c14aa58d51ee088bd2791cabf5d0a70`
- `feature/public_site_port` @ `47463eb81e85020f230b18b1065c751eabd9cc16`
- `fix/manual-master-email-deploy-20261029` @ `124cddce4fc52037b1858521b089e04bb0f92b43`
- `fix/master-optional-staff-mail-20261029` @ `70e870f171f1ef79252ec36bca08cf8cac9d801c`
- `refactor/original-erp-architecture-20261029` @ `4aab163e6c800197d07d4ab53ffa85ad61078afb`
- `release/academic-years-20261029` @ `755908154e9bd5f80edc3f88b75bc2594e45b355`
- `release/batches-20261029` @ `d82934343aa189b4da41c66ad1f5e38f5ba3eae3`
- `release/programme-offerings-20261029` @ `ecdcebc7cef0d6072255e07a3a787d6786a728d9`

## Retained branches after cleanup

- `master` — live production baseline
- `dev` — isolated Cloudflare development deployment; automatic tests
- `feature/admissions-source-parity` — ongoing exact original admissions UI/workflow port

No migration, auth, finance or Cloudflare configuration files were overwritten by an older branch. A verified green dev deployment is required before stale branches are deleted. Exact branch tips remain recoverable via this merge commit's parents.
