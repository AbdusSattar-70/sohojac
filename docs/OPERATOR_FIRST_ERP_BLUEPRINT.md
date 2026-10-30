# Sohojac: operator-first ERP — pinpoint audit and redesign blueprint

**Review date:** 31 October 2026  
**Repository:** AbdusSattar-70/sohojac, inspected at master commit d53101c7032b60e61428b77ad02ed17709993a89  
**Document status:** Proposed product and engineering strategy; **review-only, no runtime changes authorized by this document**  
**Technical architecture:** [Enterprise-grade modular target architecture, command contracts and migration gates](./ERP_TARGET_ARCHITECTURE.md)  
**Audience:** Owner, administrator, operator, teacher, developer and future QA staff  
**Product:** Sohoj Academy coaching-centre ERP and public website; one Cloudflare D1 shared by dev/main; English-only dark ERP; no student/guardian accounts; guardians reached by SMS.

## Executive recommendation

**Stop modelling an operator's daily task as a chain of database setup pages.** Keep the strong audit trail and fee controls, but replace fragmented offering / public / fee / subject / batch configuration with a **guided Programme Launch workspace** and role-based daily work queues. Non-specialists should be able to perform a normal admission, payment, class attendance, and programme launch without knowing the terms offering, ledger, D1, migration, revision or status flag.

The primary product promise is **correct work with minimal training**, not maximum numbers of forms, navigation entries or configurable flags. The system should supply sensible defaults, validate before committing, explain blocked actions in plain language, and show a receipt or next action when a task succeeds. This is the proposed target design, not a claim about the current site.

Do not delete financial, student, consent or audit history to simplify the UI. Do not remove automated tests or permission checks as workflow "cleanup."

## Scope and confidence

Inspected the live-branch source of the offerings page/form/public controls; fee plans; academic/batch commands; two subject catalogs; CRM academic setup; navigation and dashboard; collection API and billing overview; source workflow guides; package dependencies; and the sole GitHub Actions workflow. This is a **source-level, targeted review**. It is **not** a complete repository line-by-line security audit, a full production acceptance test, an authenticated manual browser walkthrough, a penetration test, a load test, or proof that every original ERP feature exists. Findings are classified accordingly. Previous release claims and green CI do not establish usability.

### Pinpoint findings: existing implementation

| ID | Priority | Verified code observation | User impact | Decision |
|---|---|---|---|---|
| O-01 | High UX / data model | Academic Setup uses **academic_subjects**, while the offerings/public picker and dedicated Subjects screen use **academy_subjects** with class/group dimensions. Two write paths exist. See [Academic Setup query](https://github.com/AbdusSattar-70/sohojac/blob/master/modules/crm/manage/queries.ts#L16-L27), [offering query](https://github.com/AbdusSattar-70/sohojac/blob/master/modules/offerings/queries.ts#L53-L59), and [Subjects API](https://github.com/AbdusSattar-70/sohojac/blob/master/app/api/staff/subjects/route.ts#L5-L22). | An operator adds "Bangla" in one register but may not see it in another; dozens of same-name grade variants appear. | Consolidate a canonical subject master before changing storage; public marketing must not require manual class-based subject assignments. |
| O-02 | High UX | Public controls have ~697 lines and mix English/Bangla titles, schedule, requirements, policy, icon, sort, dates, two publication switches and a subject picker. See [public controls](https://github.com/AbdusSattar-70/sohojac/blob/master/modules/offerings/components/public-controls-form.tsx#L41-L119) and [subjects section](https://github.com/AbdusSattar-70/sohojac/blob/master/modules/offerings/components/public-controls-form.tsx#L558-L678). | Far too much input for a simple programme card. Subject selection is misplaced under Website and application settings. | Replace with small operator fields + Advanced details; remove this subject control from the normal publishing flow after data migration. |
| O-03 | High UX | Offering creation asks for learning context, branch, year, class, programme, group, code and mandatory audit reason. See [offering form](https://github.com/AbdusSattar-70/sohojac/blob/master/modules/offerings/components/offering-form.tsx#L102-L127) and [form fields](https://github.com/AbdusSattar-70/sohojac/blob/master/modules/offerings/components/offering-form.tsx#L257-L375). | Routine staff must understand internal catalog and construct machine codes before creating a course. | User chooses course, eligible classes and campus; system suggests year, name and code. Reason requested for consequential changes, not as unexplained jargon. |
| O-04 | High UX / workflow | Fee publication automatically changes a draft offering to ACTIVE; a separate Public settings screen then toggles visibility and applications; batch creation separately requires a current fee. See [fee publish command](https://github.com/AbdusSattar-70/sohojac/blob/master/modules/offerings/actions.ts#L113-L134), [public controls](https://github.com/AbdusSattar-70/sohojac/blob/master/modules/offerings/components/public-controls-form.tsx#L115-L249) and [batch command](https://github.com/AbdusSattar-70/sohojac/blob/master/modules/academics/batches/actions.ts#L22-L58). | A draft appears "broken" until hidden prerequisites are fulfilled across pages; ACTIVE and Visible are easily confused. | Show one preflight checklist and one final Publish action. Separate internal readiness, public visibility and application intake in data but not as cryptic front-line switches. |
| O-05 | High UX / semantics | An offering currently has one class ID and optional group ID. See [offering schema](https://github.com/AbdusSattar-70/sohojac/blob/master/modules/offerings/schema.ts#L6-L29). | Class 8–9 exam readiness becomes duplicated per-class offerings even if programme, price and content are shared. | Support **eligible class set** on a programme intake; optional price/batch variants by class. Do not change IDs without a mapped migration. |
| O-06 | High reliability | Legacy collections POST has role-only authorization and creates a fresh payment UUID per request with no idempotency key; the finance UI uses it. See [collections route](https://github.com/AbdusSattar-70/sohojac/blob/master/app/api/staff/collections/route.ts#L5-L9), [POST](https://github.com/AbdusSattar-70/sohojac/blob/master/app/api/staff/collections/route.ts#L31-L74), and [billing client](https://github.com/AbdusSattar-70/sohojac/blob/master/components/erp/billing-overview.tsx#L18-L32). | Retry or double submission may record two legitimate-looking payments when a balance remains; permission policy differs from named grants. | **Block routine expansion until retry-safe payment posting and named permissions are tested.** Preserve receipts/audit/ledger. |
| O-07 | High reliability | Legacy batch API inserts a PLANNED batch whenever the offering ID exists; newer academic command demands ACTIVE offering and current fee. See [batch API](https://github.com/AbdusSattar-70/sohojac/blob/master/app/api/staff/batches/route.ts#L37-L65) versus [academic command](https://github.com/AbdusSattar-70/sohojac/blob/master/modules/academics/batches/actions.ts#L29-L57). | Two screens/clients can create meaningfully different records. | Route both callers through one authorized domain command; eliminate weaker legacy mutations. |
| O-08 | Medium/High UX | Billing overview computes "Invoiced / Collected / Outstanding" from the **latest 200 invoices**, not all invoices. UI discloses this; server caps results. See [billing overview](https://github.com/AbdusSattar-70/sohojac/blob/master/components/erp/billing-overview.tsx#L18-L52) and [collections list limits](https://github.com/AbdusSattar-70/sohojac/blob/master/app/api/staff/collections/route.ts#L10-L26). | Headline cards can be mistaken for full academy totals despite a paragraph disclaimer. | Use all-record server aggregates; reserve last-200 lists for "recent invoices" and label scope adjacent to each figure. |
| O-09 | Medium UX | A dedicated subject assignment flow exists in addition to Academic Setup and Public settings. The dedicated page styles white backgrounds/blue-on-white even though the ERP contract is dark-only. See [Subjects screen](https://github.com/AbdusSattar-70/sohojac/blob/master/components/staff/subjects-register.tsx#L7-L9) and [subject assignment](https://github.com/AbdusSattar-70/sohojac/blob/master/components/staff/subjects-register.tsx#L58-L76). | Three places to manage nearly the same subject concept; visual inconsistency. | Retire redundant UI only after canonical subject mapping and consumer cutover; retain scheduling-related subject choices where truly used. |
| O-10 | Medium UX | The sidebar limits displayed destinations to implemented routes, but the dashboard and workflow guides still link to some unimplemented original routes, e.g. pending approvals, staff operations, academic planning/questions/progress. See [implemented routes](https://github.com/AbdusSattar-70/sohojac/blob/master/modules/platform/navigation/erp-route-registry.ts#L371-L391), [dashboard links](https://github.com/AbdusSattar-70/sohojac/blob/master/app/dashboard/page.tsx#L29-L52), and [setup guides](https://github.com/AbdusSattar-70/sohojac/blob/master/modules/help/setup-steps.ts#L50-L80). | Clicking a well-intentioned next step can lead to a missing page or confusing redirect. | Use the same route capability registry for cards, search, breadcrumbs and help; never advertise unavailable actions. |
| O-11 | Medium maintainability | Only **one** Actions workflow file exists, with **three jobs** (build, main release, dev release), but it spans 1,681 lines including a long inlined shell smoke test. Pushes to master/dev run it. See [workflow](https://github.com/AbdusSattar-70/sohojac/blob/master/.github/workflows/public-site-check.yml#L1-L16), [test body](https://github.com/AbdusSattar-70/sohojac/blob/master/.github/workflows/public-site-check.yml#L124-L180), and [deployment jobs](https://github.com/AbdusSattar-70/sohojac/blob/master/.github/workflows/public-site-check.yml#L1393-L1567). | Long, coupled, difficult to debug; docs-only changes can cause unnecessary builds/releases. | Keep critical checks; extract smoke scripts, have separate small reusable validate/deploy steps, and safely skip deployments for docs-only changes. |
| O-12 | Medium maintainability | Key framework dependencies include "latest"/"beta" ranges; no explicit lint/format/typecheck/test scripts in package.json. See [dependencies and scripts](https://github.com/AbdusSattar-70/sohojac/blob/master/package.json#L6-L47). | Harder to reproduce a build and require consistent quality gates. | Pin approved package versions and add automated lint, format, tests and dependency review before release. |
| O-13 | Medium data integrity | Master edits include updates by ID without expected-version conditions, for example class, group, subject and programme settings. See [master-data action](https://github.com/AbdusSattar-70/sohojac/blob/master/modules/crm/manage/actions.ts#L14-L55). | Last save can silently overwrite another administrator's edit. | Add optimistic concurrency for mutable masters with a plain-language conflict screen. |
| O-14 | Product scope | Current source still exposes SCHOOL / COACHING / TRAINING modes and bilingual marketing copy while academy operators mainly run coaching classes. See [learning context](https://github.com/AbdusSattar-70/sohojac/blob/master/modules/offerings/components/offering-form.tsx#L214-L224) and [public copy fields](https://github.com/AbdusSattar-70/sohojac/blob/master/modules/offerings/components/public-controls-form.tsx#L267-L368). | Advanced configuration dominates ordinary tasks. | Default to Coaching; expose other modes and public translations only when explicitly needed. The public website may remain bilingual; ERP UI stays English. |

These are **code observations and design recommendations**; they do not assert that the errors were reproduced in a user session today. Earlier duplicate-payment evidence is also recorded in the existing development strategy. No row above authorizes destructive deletion.

## Proposed information model: only four concepts for everyday setup

**1. Programme** — a reusable educational service, e.g. SSC A+ Preparation, Annual Exam Readiness, Boys Evening Care. It owns the marketing name, broad content/subject bundle when applicable, intended age/grade eligibility and standard description.

**2. Intake** — a particular year/term, campus and eligible class set for that programme. Examples: "SSC A+ Preparation · 2027 · Main Campus · Class 10 Science" and "Annual Readiness · 2026 · Classes 8–9". One intake can have multiple batches. Do not require a separate offering per class when the terms are genuinely shared.

**3. Batch** — a timetable, responsible teacher/room if known, start date, seat capacity and actual enrolments. The current 12-student maximum remains enforced. If no timetable exists, use "Schedule to be confirmed", not a fictitious time.

**4. Student account** — one immutable student identity with enrollments, fee-plan snapshot, invoices, receipts, refunds and due history. **Invoice is a charge; receipt proves actual payment.** Re-enrollment adds an enrollment, not a duplicate person.

Internally, existing offering IDs, D1 schema relations and history may remain until the canonical migration is approved. The UI can say "Intake" or "Programme availability" without immediately renaming database tables.

### Subjects: the specific design decision

**Remove "Subjects on this offering" from the routine Website and application form. Do not remove subject data or teaching subjects from the ERP.**

- Keep **one canonical subject directory** with a stable identifier, localized name and aliases; do not create 12 identical "Bangla" masters solely because Classes 1–12 exist.
- Put optional course composition in a **Programme curriculum / Included subjects** sub-section. A curriculum template can apply to multiple grades or groups. Add grade-specific subject overrides **only when the educational offering actually differs**, not by default.
- The public website card should derive "Subjects covered" from that curriculum **if configured**; otherwise omit the subject list or show a curated high-level description. Subject selection must not gate publication.
- Actual teaching sessions still require a subject/topic when timetable, teacher assignment, attendance, exams or progress reports need it. Subject membership is a teaching concern, not a marketing toggle.
- Applicant-selected subjects are an optional preference only for a subject-specific service. A full-package SSC Science programme should not demand choosing each school subject.
- Before migrating, inventory all academic_subjects, academy_subjects, academy_offering_subjects, subject assignment APIs, public subjects_json consumers and session/result foreign keys. Build an alias/old-ID mapping, migrate in a transaction with rollback checks, compare counts and generated public cards, then retire the duplicate UI. Never delete or regenerate student history.

**Example:** For "SSC A+ Preparation — Science — Class 10", staff select the programme and Science eligibility. The subject bundle appears automatically from the programme template (optional); they do **not** tick 15 class-based entries just to publish an admission card.

## The replacement workflow: one Programme Launch workspace

The operator sees a single page for the selected programme, with small, resumable sections:

| Step shown to operator | Minimum data | Default/automation | Action and feedback |
|---|---|---|---|
| 1. What are we offering? | Programme, eligible class(es), campus, academic year/term | Coaching mode; active year/campus prefilled; human-friendly name and machine code generated | **Save draft** — "Draft saved. Add price to open enrolment." |
| 2. What does it cost? | Fee amount/cycle, optional one-time admission fee | Copy previous approved fee as a new draft; show guardian-facing total | **Review & publish price** (authorized only); old price version never overwritten |
| 3. How many students? | One or more batches, 1–12 seats, start and optional schedule | Offer "Morning A" / "Evening A" names; capacity defaults to 12 | **Save batch** — show number of seats, prevent overbooking |
| 4. What will families see? | Public title, short description, contact/application action | Populate from programme/intake; optional advanced content hidden | **Preview public card** with real fee, seats and application dates |
| 5. Launch | Review readiness checklist | Check current fee, programme eligibility, active campus, dates, permissions, content and valid seat count | **Publish programme** — one atomic, audited operation; clear final status and public URL |

**Do not make a page per step.** These are sections within one intake detail page; advanced users may open full Fee Plans and Batch registers from contextual links. Incomplete sections show "Needs price" or "Needs batch" with a **Fix now** action; no cryptic "DRAFT / ACTIVE / Visible / Open" puzzle.

### Publication semantics to keep safely separate behind one review

- **Draft**: internal editing; no confirmed paid admissions.
- **Ready**: required programme details and current published fee are valid; optional capacity/schedule requirements depend on chosen intake policy.
- **Published**: publicly visible, with approved copy and appropriate real fee/seat information.
- **Enquiry only**: visible and can collect interest without a price or ready batch **only if** the public CTA clearly says "Register interest" and does not promise enrollment or an amount due. This is a proposed policy change requiring explicit product approval.
- **Applications open**: an eligible application date and active admission pathway exist; can collect verified application details. Staff review and placement still gate enrollment.
- **Paused/closed/archived**: stop new applications while preserving history and published financial terms.

One main status with a short explanation is better for operators than multiple independently named toggles. Internally preserve the distinct visibility/intake states for data integrity and future scheduling.

### Example replacement screen (text wireframe)

**SSC A+ Preparation 2027 — Science**  
Main Campus · Class 10 · 2027 · Draft — **Needs price**

**Complete to publish:** Programme ✓ · Price **Needs action** · Batch ✓ (12 seats) · Public details ✓

**Next action: Set standard monthly fee**  
Monthly tuition [৳ amount] · Admission fee [optional]  
**Save draft** | **Review & publish fee**

**Website preview** (not public yet): title / short description / classes / genuine availability  
**Publish programme** (disabled only with the exact reason and direct fix action)

**More options:** subject curriculum, advanced dates, discount rules, internal codes, audit history, bilingual public copy.

The row action should read **Continue setup**, not force a person to discover "Public settings" and "Fee Plans" in unrelated modules. After any save show which section changed, what is still missing and a visible next action.

## Day-to-day journeys for a first-time employee

### New student admission: 4 understandable steps

1. **Find or add student** — search by name/phone/ID; show likely duplicates before creating a new person; Enquiry is optional.
2. **Choose programme and batch** — offer only eligible intakes and real available seats; show tuition and admission charge before confirmation.
3. **Review guardian details and consent** — relationship from the master; required signature/document status displayed, no unnecessary account creation or invented scan.
4. **Confirm charges and admission** — summary with allowed discount and approval; create the identity/invoice once. **Receive payment** is a separate explicit action, with a receipt and remaining due shown. No silent collection.

Use save-and-continue, visible progress, back navigation retaining entries, and a final review summary. Returning students reuse their identity. Do not equate incomplete application with rejected admission.

### Daily operator home

- **Today:** applications awaiting verification; unpaid dues needing contact; classes today; capacity approaching full; missing attendance; tasks blocked by missing setup.
- Each card answers **what happened, why it matters, and what to do now**. Totals must be all-record or explicitly labelled "recent records".
- **Quick actions:** New admission, Record payment, Mark attendance, Add enquiry, Create programme. Hide unrelated menus by permission.
- Show simple nouns, e.g. "Fees due" rather than "receivables", "Record money received" rather than "post allocation", "Student list" rather than "master register". Expert accounting terminology may remain in Advanced/Finance.

### Payments, refunds and daily close

- Before taking money: verify the student, invoice, outstanding amount and method. On submit use a stable idempotency key so double tap/retry returns **the same receipt**. Guard against parallel collections.
- Show **Amount charged / Amount received / Amount still due**. Never label an invoice as cash received.
- Refunds, reversals and adjustments need a separate authorized workflow and audit reason; do not edit posted receipts in place.
- Finance managers can drill down into journal/GL, but operators should not need to understand GL to record an actual payment.
- Daily close should reconcile system receipts with counted cash and payment methods; exceptions require review. Do not invent a balanced state.

### Teachers and administrators

- Teacher home should show **Today's classes**, **Take attendance**, **Record lesson & homework**, **Enter test results** and **Requests requiring correction**. No finance/payroll menus unless specifically permitted.
- Administrator home should show the same task queues plus **Approvals**, **Fees**, **Staff/access**, **Programme setup** and **Audit**. Avoid switching among dozens of registers for one task.
- Public families should use the website and short enquiry form, not an ERP account.

## Navigation and responsive UI specification

Aim for **six or seven primary destinations** in the operator sidebar: **Today**, **Enquiries & Admissions**, **Students**, **Classes & Batches**, **Fees & Payments**, **Staff** (permission-based), and **Reports** (permission-based). Put **Programme Setup**, campus settings, reference lists, access rules and audit under a single **Administration / Setup** workspace, visible only to authorized roles.

Keep a persistent global **Search** (student/guardian/application/receipt), breadcrumb or Back to list, mobile bottom sheet or collapsible navigation, stable Save/Cancel placement and an inline contextual Help action. Use semantic spacing, readable type, dark-only ERP tokens, adequate contrast, visible focus, keyboard operation, reduced-motion support, accessible table-to-card presentation on narrow screens. Never force horizontal scrolling for a single primary action on a phone.

Do not preserve a confusing original screen **only for visual parity**; preserve its validated business rules, audit events and data migration contract. Any explicit original-ERP parity requirement still governs until a redesign decision is approved.

## Guidance without prior coaching, administration or finance experience

- **Progressive disclosure**: show only fields necessary for today's action; advanced configuration is optional. Do not make beginners understand version numbers, database joins or accounting codes.
- **Plain-language status**: "Cannot publish: add a current monthly fee" plus **Set fee** button, not "conflict" or "stale state" without remedy.
- **Prevention before error**: filter invalid choices and show why choices are unavailable; revalidate again on the server when saving.
- **Safe defaults**: current campus/year, 12-seat cap, prefilled programme description. Never assume a money amount, guardian consent, payment or teacher attendance.
- **Consistent errors**: an error summary links to the relevant field; error, help and success messages remain visible after transitions.
- **Review before irreversible changes**: payments, published fees, admissions, cancellations, student identity merges and role changes show human-readable before/after and may require secondary authorization.
- **Audit without form fatigue**: automatically log actor/time/action/reason; ask for a short mandatory reason on material correction, override or deactivation, rather than every harmless draft save.
- **Help in context**: one sentence of explanation plus the next action; don't rely on a separate long Help page with links to unavailable routes.

Evidence and design references: [Nielsen Norman usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/), [GOV.UK Check answers](https://design-system.service.gov.uk/patterns/check-answers/), [GOV.UK task list guidance](https://design-system.service.gov.uk/components/task-list/), [GOV.UK error messages](https://design-system.service.gov.uk/components/error-message/), and [WCAG 2.2](https://www.w3.org/TR/WCAG22/).

## Engineering workflow: simplify without disabling safeguards

**Actual current state:** one workflow file, three jobs (build, main release, dev release), not many separate automatic job files. It includes a ~1,300-line embedded test shell section. Its shared-D1 deployment concurrency and pre-deploy recovery bookmarks are safety-critical and must stay.

1. **Extract** inlined smoke tests into smaller versioned scripts grouped by auth/security, admissions, academic/offerings, finance and deployment. Keep the same assertions and local test data; remove only proven duplicate assertions.
2. **CI fast gates**: typecheck, lint/format, tests, migration lint, domain parity and Worker build. No unnecessary live DB writes from pull-request CI.
3. **Deploy dev on tested code changes** with one shared-D1 release lock; the current dev Worker shares production data, so dev must not run destructive experiments or user-visible test financial postings.
4. **Deploy main only from the tested, authorized master revision**, after backup bookmark/migrations and production smoke checks; no skipped build accepted. Keep an explicit tested rollback procedure and audit who triggered releases.
5. **Docs-only modifications**: run lightweight documentation/link validation and skip Worker upload, DB migrations, seed and reset. Add safe path filters or job-level change detection; verify required checks and branch protection before introducing filters.
6. **Seeds**: preserve the prior one-time reset completion marker; do not reset the shared DB automatically. Seed reference-only data with explicit idempotency and audit/review; test destructive migrations only in ephemeral local SQLite/D1 emulation.
7. **Dependencies**: pin validated versions and use scheduled dependency PRs rather than silent latest/beta changes on a release; install with frozen lockfile.
8. **Observability**: track command outcome IDs, meaningful non-sensitive errors, access denials, failed writes, migration status, page performance, and audit trails. Do not log raw credentials or minors' personal information.

## Proposed delivery phases and acceptance gates

| Order | Phase | Primary acceptance evidence |
|---|---|---|
| **P0 — safety first** | Fix legacy collection idempotency and named-permission checks; unify batch API/command guards; preserve the existing fee-version and audit architecture | Repeated/concurrent payment command yields **one receipt and one allocation**; unauthorized role denied; unready batch rejected by UI and API |
| **P1 — subject model** | Inventory and reconcile two subject masters; define global subjects + optional programme curriculum; move class/grade variation to eligibility/curriculum mappings | No duplicate same-name pickers; master edits propagate predictably; old IDs/session/result links and public cards preserved |
| **P2 — Programme Launch MVP** | Consolidate offering/fee/batch/public readiness into one guided workspace, plain-language statuses and review/publish | Non-specialist completes a valid programme launch without visiting separate registers; no invalid fee/seat published |
| **P3 — daily operator experience** | Task-first dashboard, admission/collection guided flows, accessible mobile interactions, route registry consistency | Complete new and returning admission, receipt and due follow-up with no dead links or ambiguous status |
| **P4 — financial and operating maturity** | Full-ledger aggregates, durable receipts, reversals, end-of-day close, recurring fees, accountable approvals, report definitions | Reconciled totals match ledger; retries safe; corrections traceable; performance/pagination validated |
| **P5 — engineering cleanup** | Split large CI script, quality tooling, version pinning, measured removal of unused code and routes, recovery exercise | No lost regression coverage; docs-only deploy avoided; test rollback; basic accessibility/performance checks |
| **P6 — source parity acceptance** | Reconcile and complete promised source features, run role-based operator acceptance | Source parity matrix with behavior/evidence, not page-count proxy; unresolved items and exclusions explicit |

**Ordering nuance:** P0 must precede any further financial write expansion. P1 and P2 need a single reviewed data/UX contract before deleting subject UI. The prior development strategy's Phase 2/3 work should be incorporated, **not discarded**; this is a proposed UX-first regrouping until approved.

### Measurable usability acceptance (targets, not observed metrics)

- Give **5 novice operators** realistic tasks with no coaching or finance training. Aim for **at least 4/5** completing each routine action independently after a short orientation; document causes of failure.
- Launch a standard coaching intake with **no more than 5 meaningful operator decisions** after choosing a programme, assuming defaults exist; advanced settings cannot block routine work unless legally/operationally necessary.
- Each blocked action explains **what is missing and the direct next step** on the same screen, including keyboard/screen-reader announcement.
- One accidental duplicate click or network retry must **not** double-post a payment, admission or fee version.
- Every visible navigation/help/quick-action destination is reachable by a permitted user and has a real implementation; no 404, hidden permission loop or phantom action.
- At 375px-wide mobile layout the primary path has no horizontal scroll, clipped select, inaccessible button or unreadable status.
- A totals card accurately states its **scope, date/time, currency and freshness**; financial values reconcile to server query/ledger.
- WCAG 2.2 AA is the accessibility **target**, not a certification claim; verify core form, authentication, navigation, errors, tables and printable A4 forms.

## What to KEEP, MERGE, HIDE or RETIRE

| KEEP | MERGE / HIDE in the UI | RETIRE only after migration |
|---|---|---|
| Single shared D1; immutable student/staff IDs; audit history; source mapping; permissions; idempotent domain commands; fee snapshots; real receipts; 12-seat policy; recovery bookmarks; domain regression tests | Offering, Fee Plan, Batch and Public settings into Programme Launch; campus/year defaults; audit reasons for routine draft edits; optional bilingual public content and topic curriculum under Advanced | Duplicate subject master/write path and subjects-assignment UI; legacy weaker finance/batch APIs; outdated unavailable help links; redundant tests/workflows after coverage audit; unused dependencies |
| Guardian relationships, class reference list 1–12, public enquiry form, staff-only ERP, SMS guardian notification policy | Separate visibility/open toggles behind readiness/publish decision; role-targeted dashboard terminology | No historical data deletion, no disabling permissions/backup/CI to reduce page count |

## Required review checkpoints before implementation

1. **Owner decision:** Approve whether a public "Register interest" page may be visible before a published Fee Plan or batch exists. It must never promise a confirmed seat/price without the real data.
2. **Owner decision:** Approve global subject master + curriculum templates and programme eligibility covering multiple classes. Verify whether teaching/scheduling needs any genuinely class-specific subjects.
3. **Technical decision:** Map all existing IDs, references and public JSON before subject migration; choose a non-destructive strategy compatible with the single shared database.
4. **Technical decision:** Approve the new task-based navigation and copy without reducing existing authorization or financial controls.
5. **Release decision:** Change one bounded slice at a time, test in ephemeral local data, then dev/main with the shared DB and full recovery evidence. Update the original strategy with verified phase status; do not claim this blueprint implemented before it is.

---

### Summary

The current ERP is **feature-accumulative**: it has many valid backend controls but asks the operator to understand them all. A professional coaching-centre ERP should feel like **five everyday actions backed by an invisible, trustworthy ledger and clear safeguards**. The shortest viable path is **payment/permission integrity → one subject model → one programme-launch workspace → task-first admissions and daily operations**.