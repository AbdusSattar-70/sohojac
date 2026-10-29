import fs from "node:fs";
const m=JSON.parse(fs.readFileSync("docs/legacy-erp-inventory.json","utf8"));
const paths=["types/erp.ts","modules/platform/navigation/erp-route-registry.ts","modules/platform/navigation/workspace-navigation.ts","modules/platform/navigation/erp-navigation.ts"];
for(const p of paths){if(!fs.existsSync(p)) throw new Error("Missing original contract: "+p);}
const code=fs.readFileSync(paths[1],"utf8");
const actual=[...code.matchAll(/\{\s*id:\s*"([^"]+)"[\s\S]*?href:\s*"([^"]+)"[\s\S]*?permission:\s*"([^"]+)"/g)]
.map(x=>({id:x[1],href:x[2],permission:x[3]}));
if(JSON.stringify(actual)!==JSON.stringify(m.source_routes))throw new Error("Original ERP route/permission registry changed");
if(m.source_pages.length!==m.source_page_count||actual.length!==m.source_navigation_count)
throw new Error("Source route inventory inconsistent");
if(m.status!=="REFERENCE_ONLY_NOT_FUNCTIONAL_PARITY")throw new Error("Unverified parity claim");
console.log("Pinned original ERP architecture:",m.source_commit);
console.log("Dashboard pages:",m.source_pages.length,"Permission-bound routes:",actual.length);
console.log("State: reference only; functional parity is not yet established.");
