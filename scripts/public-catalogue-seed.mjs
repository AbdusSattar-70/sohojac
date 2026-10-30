import fs from "node:fs";
// Historical catalogue regression support. The isolated dev release uses only
// seed-dev-reference.mjs and must never manufacture a production-reset marker.
export async function seedPublicCatalogue(query) {
  const existing = (
    await query(
      "SELECT status FROM system_maintenance_operations WHERE id='public-catalogue-20261030-v1'",
    )
  )[0].results[0];
  if (existing?.status === "COMPLETE") return { applied: false };
  const prerequisites = (
    await query(
      "SELECT EXISTS(SELECT 1 FROM staff_memberships WHERE role='OWNER' AND active=1) active_owner,EXISTS(SELECT 1 FROM system_maintenance_operations WHERE id='foundation-reset-20261030-v1' AND status='COMPLETE') foundation_complete",
    )
  )[0].results[0];
  if (prerequisites?.active_owner !== 1)
    throw Error("Historical public catalogue requires an active owner.");
  if (prerequisites?.foundation_complete !== 1)
    throw Error(
      "Historical public catalogue requires a completed foundation reset; fresh development uses the separate reference seed.",
    );
  await query(
    fs.readFileSync(
      new URL("../seeds/public-catalogue.sql", import.meta.url),
      "utf8",
    ),
  );
  const row = (
    await query(
      "SELECT (SELECT count(*) FROM public_programme_offerings WHERE code IN ('BEC8-2026','BEC9-2026','BEC10-2026') AND show_on_website=1 AND is_active=1) offerings,(SELECT count(*) FROM academy_batches WHERE code IN ('BEC8-A-2026','BEC9-A-2026','BEC10-A-2026') AND status='ACTIVE' AND capacity=12) batches",
    )
  )[0].results[0];
  if (row.offerings !== 3 || row.batches !== 3)
    throw Error("Catalogue verification failed.");
  return { applied: true, ...row };
}

