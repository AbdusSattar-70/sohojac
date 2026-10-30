import fs from "node:fs";

/**
 * Exact one-time cleanup of 2026 showcase fixtures bundled in immutable
 * historical migrations. May run ONLY on a VERIFIED EMPTY dev D1 or local
 * synthetic test DB. This module is never a production reset facility.
 */
export const freshDevLegacyCleanupStatements = [
  "DELETE FROM academy_offering_subjects WHERE offering_id IN ('sa-annual-2026','sa-ssc-science')",
  "DELETE FROM academy_subjects WHERE id IN ('physics','chemistry','biology','higher-maths')",
  "DELETE FROM public_programme_offerings WHERE id IN ('sa-annual-2026','sa-ssc-science')",
];
export const devReferenceSeedSql = () =>
  fs.readFileSync(new URL("../seeds/dev-reference.sql", import.meta.url), "utf8");
export const freshDevBootstrapSql = () =>
  [...freshDevLegacyCleanupStatements, devReferenceSeedSql()].join(";\n");
