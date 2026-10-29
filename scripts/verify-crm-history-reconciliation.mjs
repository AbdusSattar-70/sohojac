#!/usr/bin/env node
/* Regression gate for historical CLOSED website enquiry reconciliation.
 * This is a source migration compatibility check, not a substitute for E2E.
 */
import fs from "node:fs";
const read=path=>fs.readFileSync(path,"utf8");
const action=read("modules/crm/reconciliation-actions.ts");
const page=read("app/dashboard/crm/prospects/[prospectId]/page.tsx");
const component=read("modules/crm/components/prospect-reconciliation-form.tsx");
const crm=read("migrations/0026_original_crm_prospects.sql");
const followup=read("modules/crm/actions.ts");
for(const check of [
  'z.enum(["NEW", "CONTACTED", "LOST"])',
  'permissions.includes("crm.prospects.manage")',
  'getErpContext()',
  'new URL(origin).host.toLowerCase()',
  'existing.status !== "LEGACY_CLOSED"',
  'existing.public_status !== "CLOSED"',
  "status='LEGACY_CLOSED' AND version=?",
  "LEGACY_STATUS_RECONCILED",
  "env.DB.batch([",
  'WHERE changes()=1',
  "revalidatePath",
]) if(!action.includes(check))throw Error("Unsafe historical reconciliation: missing "+check);
for(const check of [
  'ProspectReconciliationForm',
  'prospect.status === "LEGACY_CLOSED" && can(context, "crm.prospects.manage")',
  'prospect.status !== "LEGACY_CLOSED"',
])if(!page.includes(check))throw Error("Historical CRM UI missing: "+check);
for(const check of [
  'reconcileLegacyProspect',
  'Evidence and reason',
  'minLength={12}',
  'Choose after reviewing evidence',
])if(!component.includes(check))throw Error("Review form missing: "+check);
if(!crm.includes("LEGACY_CLOSED")||crm.includes("THEN 'LOST'"))
 throw Error("Legacy migration must preserve ambiguous CLOSED records");
if(!followup.includes("historical CLOSED request needs status reconciliation"))
 throw Error("Normal counselling must not bypass historical reconciliation");
console.log("Historical CLOSED data is preserved and only explicitly reviewed/authorized classifications may enter the source workflow.");
