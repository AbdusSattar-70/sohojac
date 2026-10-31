import { env } from "cloudflare:workers";
import { requirePermission } from "@/modules/platform/auth/erp-context";
import { globalSubjectDirectorySql, legacySubjectUsageSql } from "@/lib/subject-directory-sql";

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
    env.DB.prepare(globalSubjectDirectorySql).all<GlobalSubject>(),
    env.DB.prepare(legacySubjectUsageSql).all<LegacySubjectUsage>(),
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
