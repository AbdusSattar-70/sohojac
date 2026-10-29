# Sohoj Academy: one feature per production release

Production branch: `feature/staff_crm_better_auth`. Development branch:
`feature/erp_access_lifecycle` (not production).

1. Prepare a separate `release/<feature>` branch from the **current** production head.
2. Copy ONLY files needed by the feature and prerequisite additive migrations.
3. Run the production branch's CI against the release PR. Check local D1
   migrations, TypeScript, Worker build, real authenticated workflow and denial cases.
4. Merge the isolated release PR only after CI passes and the diff is reviewed.
5. The production branch's push workflow applies pending D1 migrations, deploys
   the Worker and runs HTTP smoke tests. Check the **release job**, not only build.
6. Verify the feature is accessible for authorized staff and unrelated public
   routes are healthy. Do not claim production deployment on a skipped release.
7. Only then prepare the next isolated feature release. Never merge the entire
   partial ERP parity branch or deploy untested finance/admission behavior.

This first release includes 0005–0007 migrations, which add empty ERP
foundation tables and an academic-year version column; no synthetic data.
Other feature screens and endpoints remain unavailable until individually released.

A failed production deployment is a release incident: pause subsequent releases,
inspect the job, and perform a controlled rollback/recovery. Never rewrite an
already-applied migration.
