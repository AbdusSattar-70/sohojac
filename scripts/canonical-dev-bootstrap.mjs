import fs from "node:fs";
/** Only disposable local test references, never historical destructive resets or remote D1. */
export const devReferenceSeedSql = () =>
  fs.readFileSync(new URL("../seeds/dev-reference.sql", import.meta.url), "utf8");
export const freshDevBootstrapSql = devReferenceSeedSql;
