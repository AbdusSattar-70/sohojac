import fs from "node:fs";
import crypto from "node:crypto";
const blob=value=>{const data=Buffer.from(value);return crypto.createHash("sha1").update("blob "+data.length+"\0").update(data).digest("hex");};
const page=fs.readFileSync("app/dashboard/academics/batches/page.tsx","utf8").replace('import { getBatchWorkspace as getAdmissionWorkspace } from "@/modules/academics/batches/queries";','import { getAdmissionWorkspace } from "@/modules/admissions/queries";');
if(blob(page)!=="0e0e2539796f0377c57c1c26e50bedbdcd3e2052")throw Error("Original Batch page changed beyond its academic read adapter.");
const register=fs.readFileSync("modules/admissions/components/batch-register.tsx","utf8").replace('from "@/modules/academics/batches/state-button"','from "@/components/erp/record-state-button"').replace('                            expectedVersion={batch.version}\n','');
if(blob(register)!=="ffc11d167f0cb327f8daedff3c9849b64d28a8ae")throw Error("Original Batch Register changed beyond its lifecycle adapter.");
const form=fs.readFileSync("modules/admissions/components/command-form.tsx","utf8");
if(!form.includes('action === "CREATE_BATCH" || action === "EDIT_BATCH" ? runAcademicBatchCommand : runAdmissionCommand'))throw Error("Only batch commands may dispatch to academic batch actions.");
const query=fs.readFileSync("modules/academics/batches/queries.ts","utf8");
if(!query.includes('requirePermission("academics.view")'))throw Error("Academic batch reads require source permission.");
if(/FROM academy_students|FROM academy_admissions|FROM public_enquiries|FROM finance_invoices|FROM finance_payments/.test(query))throw Error("Batch workspace must not fetch applicant identities or money.");
console.log("Original Batch page/register presentation and scoped academic adapters verified.");

