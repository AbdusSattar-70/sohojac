import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";

test("subsequent dev releases preserve the already rebuilt independent development D1",()=>{
 const workflow=readFileSync(".github/workflows/erp-ci.yml","utf8");
 assert.doesNotMatch(workflow,/run:\s*node scripts\/reset-obsolete-dev-d1\.mjs/);
 assert.match(workflow,/node scripts\/prepare-dev-deployment\.mjs/);
 assert.match(workflow,/node scripts\/verify-release-target\.mjs development/);
 assert.match(workflow,/node scripts\/capture-d1-recovery\.mjs/);
 assert.match(workflow,/pnpm exec cf d1 migrations apply/);
 assert.match(workflow,/node scripts\/verify-canonical-dev-state\.mjs/);
 assert.match(workflow,/github\.ref == 'refs\/heads\/dev'/);
});
