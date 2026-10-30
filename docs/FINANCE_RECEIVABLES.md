# Receivables and collection follow-up

Source: `sohoj-academy@f46b61611edce0a82f69e349bb89269329233b62`,
`app/dashboard/finance/receivables` and
`modules/finance/receivables`; source database contract
`35_receivables_aging_and_collection_promises.sql`.

This slice restores the original receivables screen and guardian-statement
layout using D1. The page supports literal bounded search, five aging bands,
25-row pagination, due promises, contact evidence, installment commitments,
revision-checked cancellation/fulfillment, reminder drafts and account statements.

## Data and access

- `finance.view` is required by the page and query adapter.
- `finance.payments.post` is independently required for every follow-up command.
- Receivables use posted `finance_invoices` and canonical student identity.
  DRAFT and VOID invoices are excluded. Account statements include settled
  posted invoices and remain scoped to the selected permanent student ID.
- Aging uses the current Bangladesh date. An invoice without a recorded due
  date remains in NOT_DUE; no overdue date is inferred.
- Summary totals cover all current receivables (or the selected account);
  search, aging and due-promise filters apply to the paginated rows.
- Rows, count, summary and academy date are read in a single D1 batch snapshot.
- Staff UI remains English independently of the public-site language preference.

## Follow-up integrity

Migration `0031_finance_source_workflows.sql` adds only collection promises,
immutable contact events and immutable request keys. There is one open promise
per invoice. Dates must be current/future and promised amounts must fit the
invoice's current outstanding amount in whole integer paisa.

The baseline for a promise captures actual `finance_allocations` backed by its
student's payment records. Fulfillment requires new allocations after that
baseline; an invoice cache adjustment or waiver cannot satisfy a promise.
Commands preserve all invoice, payment, allocation and GL rows. Actual payment
posting remains in the existing Collections workspace.

Commands record actor/reason/request identity and an audit event atomically.
Identical retries return the saved result; changed payloads or another actor
cannot reuse a request. A concurrent payment/open promise/revision conflict
fails without partial evidence. Closed promises and evidence cannot be deleted
or silently edited.

## Source adaptations and remaining finance work

The current D1 ledger stores net posted invoice amounts. It does not have the
original separate posted credit, scholarship and refund subledgers. The guardian
statement therefore shows authentic billed, allocated-payment and due amounts;
it does not manufacture pre-discount gross amounts or refund/credit histories.
Those source finance workflows remain separate migration work.

No email/SMS is sent. The original reminder action copies a draft for authorized
staff to review. The Collections link opens the existing payment workspace.

## Validation and release

`node scripts/test-finance-receivables.mjs` passes 17 integration tests against
all 28 baseline migrations plus this migration. It loads the actual production
query/action code and SQL, injecting only auth/cache/validation boundaries.
Coverage includes grants, aging edges, search and pagination, statement identity
isolation, request/actor conflicts, concurrent retries/payments, actual collection
fulfillment, immutable evidence and complete audit-failure rollback.

Real Zod parsing, server-action/browser interactions, authenticated HTTP and the
Cloudflare build still require full repository CI. Navigation must enable the
existing receivables registry route; CI must run the script. No remote mutation
or deployment was made by this implementation agent.
