#!/usr/bin/env node
/* Original ERP path coverage: report; --strict fails on any missing path. */
import fs from "node:fs";
import path from "node:path";
const manifest=JSON.parse(fs.readFileSync("docs/source-first-erp-manifest.json","utf8"));
const groups=["dashboardPages","modules","erpComponents","uiComponents","sourceTypes"];
const lines=["# Original ERP path coverage", "",
 "Pinned source: "+manifest.sourceRepository+"@"+manifest.sourceCommit,"",
 "| Area | Original files | Present in target | Missing |",
 "|---|---:|---:|---:|"];
let totalMissing=0;
for(const name of groups){
 const items=manifest[name];
 const missing=items.filter(x=>!fs.existsSync(path.join(process.cwd(),x.path)));
 totalMissing+=missing.length;
 lines.push("| "+name+" | "+items.length+" | "+(items.length-missing.length)+" | "+missing.length+" |");
 lines.push("", "<details><summary>Missing "+name+" paths</summary>", "", "~~~text");
 lines.push(...missing.map(x=>x.path));
 lines.push("~~~", "", "</details>", "");
}
const domains=[...new Set(manifest.modules.map(x=>x.path.split("/")[1]))].sort();
lines.push("## Original module areas", "");
for(const domain of domains){
 const files=manifest.modules.filter(x=>x.path.startsWith("modules/"+domain+"/"));
 const found=files.filter(x=>fs.existsSync(x.path)).length;
 lines.push("- "+domain+": "+found+"/"+files.length+" files at original paths");
}
lines.push("", "Caution: a present path is NOT proof of D1 workflow, UI or security parity. All original end-to-end tests must also pass.", "");
const report=lines.join("\n");
console.log(report);
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,report);
if(process.argv.includes("--strict")&&totalMissing)process.exit(1);
