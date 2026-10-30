import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("REST batch register preserves operation identity on unchanged retries", () => {
  const src = readFileSync("components/staff/batches-register.tsx", "utf8");
  assert.match(src, /createIntent=useRef/);
  assert.match(src, /editIntents=useRef/);
  assert.match(src, /previous\?\.signature===signature\?previous/);
  assert.match(src, /"Idempotency-Key":intent\.requestId/g);
  assert.match(src, /body:JSON\.stringify\(\{\.\.\.create,requestId:intent\.requestId\}\)/);
  assert.match(src, /body:JSON\.stringify\(\{\.\.\.change,requestId:intent\.requestId\}\)/);
  assert.doesNotMatch(src, /\b(bg-white|bg-blue-50|border-slate-200|text-slate-500|text-slate-600)\b/);
  assert.match(src, /bg-background/);
  assert.match(src, /bg-card/);
});
