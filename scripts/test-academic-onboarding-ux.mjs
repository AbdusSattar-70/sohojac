import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
const read=(path)=>readFileSync(path,"utf8");

test("Subjects is one Academic Setup tab, not a duplicate or circular navigation entry",()=>{
 const routes=read("modules/platform/navigation/erp-route-registry.ts");
 const extras=read("modules/platform/navigation/erp-operational-routes.ts");
 const settings=read("app/dashboard/academics/settings/page.tsx");
 const legacy=read("app/dashboard/academics/subjects/page.tsx");
 const registry=read("modules/platform/navigation/erp-navigation.ts");
 assert.doesNotMatch(extras,/id:\s*"subjects"/);
 assert.doesNotMatch(routes,/"\/dashboard\/academics\/subjects"/);
 assert.match(routes,/href: "\/dashboard\/academics\/settings"/);
 assert.match(legacy,/redirect\("\/dashboard\/academics\/settings\?section=subject"\)/);
 assert(!settings.includes("Review Subject Directory"),"No button that loops to the current page");
 assert(!settings.includes("One global subject catalogue"),"Avoid repeating a redundant explanatory card");
 assert.match(settings,/key=\{selectedEntity\}/,"Query-targeted tabs must reset correctly");
 for(const section of ["academic_year","class","group","subject","program","school","lead_source","guardian_relationship"])
  assert(settings.includes('"'+section+'"'));
 assert.match(registry,/isAvailableErpRoute\(route\.href\)/);
});

test("confirmed academy identity is not repeatedly shown in academic setup",()=>{
 const dashboard=read("app/dashboard/page.tsx");
 const settings=read("app/dashboard/academics/settings/page.tsx");
 const identityQuery=read("modules/platform/setup/identity-queries.ts");
 const identityForm=read("modules/platform/setup/identity-form.tsx");
 assert.match(dashboard,/identity && !identity\.confirmed/);
 assert.match(dashboard,/AcademyIdentityForm/);
 assert.match(settings,/identity\?\.confirmed && identityMode === "edit"/);
 assert.match(settings,/identity=edit/);
 assert.match(settings,/Finish first-time setup/);
 assert.doesNotMatch(settings,/identity && <AcademyIdentityForm/);
 assert.match(identityQuery,/confirmed: Boolean\(identity\?\.name\?\.trim\(\) && branch\?\.name\?\.trim\(\)\)/);
 assert.match(identityForm,/mode === "setup"/);
 assert.match(identityForm,/Done editing/);
});

test("launch success only follows authoritative readiness and provides a finish path",()=>{
 const workspace=read("modules/offerings/components/programme-launch-workspace.tsx");
 const page=read("app/dashboard/academics/launch/page.tsx");
 const readiness=read("modules/offerings/programme-launch-readiness.ts");
 assert.match(workspace,/readiness\?\.publishReady \? "REVIEW" : "PROGRAMME"/);
 assert.match(workspace,/setStage\(nextReadiness\?\.publishReady \? "REVIEW" : "PROGRAMME"\)/);
 assert.match(workspace,/readiness\.publishReady \? \(/);
 assert.match(workspace,/Congratulations! Your programme is launched/);
 assert.match(workspace,/Recommended next steps/);
 assert.match(workspace,/Finish &amp; return to dashboard/);
 assert.match(workspace,/Launch another programme/);
 assert.match(workspace,/canStartAdmissions &&/);
 assert.match(workspace,/canViewEnquiries &&/);
 assert.match(workspace,/canScheduleClasses &&/);
 assert.match(page,/canStartAdmissions=\{can\(context, "admissions.create"\)\}/);
 assert.match(page,/canViewEnquiries=\{can\(context, "crm.prospects.view"\)\}/);
 assert.match(page,/canScheduleClasses=\{can\(context, "academics.sessions.manage"\)\}/);
 assert.match(readiness,/active && feeReady && openSeats > 0 && websiteVisible && applicationsOpen/);
});
