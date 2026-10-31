import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { test } from "node:test";

// Execute actual pure TypeScript readiness logic against controlled business states.
const text = readFileSync("modules/offerings/programme-launch-readiness.ts","utf8");
const js = stripTypeScriptTypes(text, { mode: "strip" });
const { getProgrammeLaunchReadiness } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);
const today = "2026-10-31";
const base = {
  id:"offer-a", name:"SSC Preparation", status:"ACTIVE", version:1,
  is_website_visible:false, is_accepting_applications:false,
  applications_open_on:null, applications_close_on:null,
};
const batch = {offeringId:"offer-a", id:"batch-1", name:"Batch A", capacity:12, occupied:0,isActive:true,version:1};
const ready=(offering={},batches=[],feeReady=false)=>
  getProgrammeLaunchReadiness({...base,...offering},batches,feeReady,today);

test("draft/fee readiness is based on the authoritative batch offering query, not fee UI guesses",()=>{
  const state=ready({status:"DRAFT"},[],false);
  assert.equal(state.stage,"FEES");
  assert.equal(state.feeReady,false);
  assert.equal(state.publishReady,false);
  assert(state.blockers.some(x=>x.includes("Fee Plan")));
});
test("planned, full or unrelated batches never advertise available seats",()=>{
  assert.equal(ready({},[{...batch,isActive:false}],true).openSeats,0);
  assert.equal(ready({},[{...batch,occupied:12}],true).openSeats,0);
  assert.equal(ready({},[{...batch,offeringId:"another"}],true).openSeats,0);
  assert.equal(ready({},[{...batch,isActive:false}],true).stage,"BATCHES");
});
test("seats available unlock website setup, not automatic publication",()=>{
  const state=ready({},[{...batch,occupied:3}],true);
  assert.equal(state.stage,"WEBSITE");
  assert.equal(state.openSeats,9);
  assert.equal(state.publishReady,false);
  assert.deepEqual(state.completed,[true,true,true,false]);
});
test("public launch requires effective fees, actual seats, visible card, open applications",()=>{
  const state=ready({is_website_visible:true,is_accepting_applications:true},[batch],true);
  assert.equal(state.stage,"REVIEW");
  assert.equal(state.publishReady,true);
  assert.equal(state.openSeats,12);
  assert.deepEqual(state.blockers,[]);
});
test("dates are evaluated in Dhaka business-day form, inclusive of opening and closing dates",()=>{
  assert.equal(ready({is_website_visible:true,is_accepting_applications:true,
    applications_open_on:"2026-11-01"},[batch],true).publishReady,false);
  assert.equal(ready({is_website_visible:true,is_accepting_applications:true,
    applications_open_on:"2026-10-31T00:00:00.000Z",
    applications_close_on:"2026-10-31T23:59:00.000Z"},[batch],true).publishReady,true);
  assert.equal(ready({is_website_visible:true,is_accepting_applications:true,
    applications_close_on:"2026-10-30"},[batch],true).publishReady,false);
});
test("retired offerings must be reactivated and cannot be reported live",()=>{
  const state=ready({status:"RETIRED",is_website_visible:true,is_accepting_applications:true},[batch],true);
  assert.equal(state.stage,"PROGRAMME");
  assert.equal(state.publishReady,false);
  assert(state.blockers.some(x=>x.includes("retired")));
});
test("final Review check is true only for a fully open and live programme",()=>{
  const live = ready({ is_website_visible: true, is_accepting_applications: true }, [batch], true);
  const missingFees = ready({ is_website_visible: true, is_accepting_applications: true }, [batch], false);
  const noSeats = ready({ is_website_visible: true, is_accepting_applications: true }, [{ ...batch, occupied: 12 }], true);
  const hidden = ready({ is_website_visible: false, is_accepting_applications: true }, [batch], true);
  const outsideWindow = ready({ is_website_visible: true, is_accepting_applications: true, applications_open_on: "2026-11-01" }, [batch], true);
  assert.equal(live.publishReady, true);
  for (const state of [missingFees, noSeats, hidden, outsideWindow]) {
    assert.equal(state.publishReady, false);
  }
});
test("multiple teaching batches contribute only their remaining seats",()=>{
  const state=ready({is_website_visible:true,is_accepting_applications:true},
    [{...batch,occupied:11},{...batch,id:"batch-2",occupied:4}],true);
  assert.equal(state.activeBatchCount,2);
  assert.equal(state.openSeats,9);
});
test("guided launch is permission-scoped, non-destructive and connected to the real commands",()=>{
  const page=readFileSync("app/dashboard/academics/launch/page.tsx","utf8");
  const component=readFileSync("modules/offerings/components/programme-launch-workspace.tsx","utf8");
  const forms=readFileSync("modules/offerings/components/operator-launch-forms.tsx","utf8");
  const registry=readFileSync("modules/platform/navigation/erp-route-registry.ts","utf8");
  assert(existsSync("app/dashboard/academics/launch/page.tsx"));
  assert(page.includes('requirePermission("academics.view")'));
  assert(page.includes('can(context, "finance.view")'));
  assert(page.includes('can(context, "finance.billing.manage")'));
  assert(registry.includes('"/dashboard/academics/launch"'));
  for(const command of ["createProgrammeOffering","publishFeePlan","runAcademicBatchCommand","updateProgrammeOfferingPublicControls"])
    assert(forms.includes(command),"must use canonical "+command);
  assert(forms.includes("crypto.randomUUID()"));
  assert(forms.includes("intentFor(request.current, signature)"));
  assert(forms.includes("const [subjectIds, setSubjectIds]"));
  assert(forms.includes("data-launch-subjects"));
  assert(component.includes("subjects={data.subjects}"));
  assert(forms.includes('disabled={!visible || (!canOpen && !accepting)}'));
  assert(component.includes('inactiveLabel="Activate batch"'));
  // The fifth review step must be checked for a ready, live offering; it
  // must never be checked merely because the operator visited the step.
  assert(component.includes('const done = index === 4 ? readiness?.publishReady === true : completed[index];'));
  assert(component.includes('description: "Publication status"'));
  assert(component.includes("Congratulations! Your programme is launched."));
  assert(!component.includes('description: "Ready to launch?"'));
  assert(component.includes("RecordStateButton"));
  assert(component.includes('selectedBatches'));
  assert(component.includes("Finish &amp; return to dashboard"));
  assert(component.includes("Launch another programme"));
  assert(!component.includes("env.DB"));
  assert(!forms.includes("env.DB"));
});
