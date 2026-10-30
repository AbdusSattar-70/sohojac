import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

for (const file of [
  "components/staff/collections-register.tsx",
  "components/staff/expenses-register.tsx",
]) {
  test(file + " follows the dark-only ERP palette and keeps action feedback", () => {
    const content = readFileSync(file, "utf8");
    for (const required of [
      "bg-background",
      "bg-card",
      "border-border",
      "text-muted-foreground",
      "text-primary-foreground",
      'role="status"',
    ]) {
      assert.ok(content.includes(required), file + " missing " + required);
    }
    assert.doesNotMatch(content, /\b(bg-white|bg-blue-50|text-blue-900|border-slate-200|text-slate-600|text-slate-500)\b/);
    assert.match(content, /crypto\.randomUUID\(\)/);
    assert.match(content, /sessionStorage/);
  });
}
