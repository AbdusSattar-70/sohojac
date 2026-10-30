import { env } from "cloudflare:workers";
import { requirePermission } from "@/modules/platform/auth/erp-context";

export type GlobalSubject = {
  id: string;
  code: string;
  name: string;
  active: number;
};

export type LegacySubjectUsage = {
  id: string;
  code: string;
  name: string;
  classGrade: number;
  groupName: string;
  active: number;
  linkedOfferings: number;
};

/**
 * One readable global subject directory.
 *
 * academic_subjects is the already-seeded global master. The class-specific
 * academy_subjects graph is still referenced by immutable historical
 * offering/card relationships, so inspect it read-only until explicit
 * crosswalks and referential migration have been reviewed.
 *
 * No name-based auto-merge, deletion or implicit master mutation is allowed.
 */
export async function getCanonicalSubjectDirectory() {
  await requirePermission("system.master_data.manage");
  const [global, legacy] = await Promise.all([
    env.DB.prepare(
      "SELECT id,code,title AS name,active FROM academic_subjects ORDER BY active DESC,title,code,id",
    ).all<GlobalSubject>(),
    env.DB.prepare([
      "SELECT s.id,s.code,s.name,s.class_grade AS classGrade,s.group_name AS groupName,s.active,",
      "COUNT(l.offering_id) AS linkedOfferings",
      "FROM academy_subjects s LEFT JOIN academy_offering_subjects l ON l.subject_id=s.id",
      "GROUP BY s.id,s.code,s.name,s.class_grade,s.group_name,s.active",
      "ORDER BY linkedOfferings DESC,s.name,s.class_grade,s.group_name,s.id",
    ].join(" ")).all<LegacySubjectUsage>(),
  ]);
  const subjects = global.results ?? [];
  const legacySubjects = legacy.results ?? [];
  return {
    subjects,
    legacySubjects,
    linkedLegacyEntries: legacySubjects.filter((row) => row.linkedOfferings > 0).length,
    legacyOfferingLinks: legacySubjects.reduce((count, row) => count + row.linkedOfferings, 0),
    activeGlobalSubjects: subjects.filter((row) => Boolean(row.active)).length,
  };
}

export type CanonicalSubjectDirectory = Awaited<ReturnType<typeof getCanonicalSubjectDirectory>>;
