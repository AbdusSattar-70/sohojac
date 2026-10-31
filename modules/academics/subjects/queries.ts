import { env } from "cloudflare:workers";
import { requirePermission } from "@/modules/platform/auth/erp-context";
import { globalSubjectDirectorySql, legacySubjectUsageSql, legacyOfferingImpactSql, assessmentSubjectLabelsSql, teachingReferenceCountsSql } from "@/lib/subject-directory-sql";

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

export type LegacyOfferingImpact = {
  legacySubjectId: string;
  legacyName: string;
  legacyCode: string;
  classGrade: number;
  groupName: string;
  offeringId: string;
  offeringName: string;
  offeringCode: string;
  publicVisible: number;
  offeringActive: number;
  snapshotContainsLegacyId: number;
};

export type AssessmentLabelUsage = {
  subjectLabel: string;
  assessmentCount: number;
  affectedBatches: number;
  earliestDate: string;
  latestDate: string;
};

type TeachingCounts = { assessments: number; sessions: number };

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
  const [global, legacy, impacts, labels, teaching] = await Promise.all([
    env.DB.prepare(globalSubjectDirectorySql).all<GlobalSubject>(),
    env.DB.prepare(legacySubjectUsageSql).all<LegacySubjectUsage>(),
    env.DB.prepare(legacyOfferingImpactSql).all<LegacyOfferingImpact>(),
    env.DB.prepare(assessmentSubjectLabelsSql).all<AssessmentLabelUsage>(),
    env.DB.prepare(teachingReferenceCountsSql).first<TeachingCounts>(),
  ]);
  const subjects = global.results ?? [];
  const legacySubjects = legacy.results ?? [];
  const offeringImpacts = impacts.results ?? [];
  const assessmentLabels = labels.results ?? [];
  return {
    subjects,
    legacySubjects,
    linkedLegacyEntries: legacySubjects.filter((row) => row.linkedOfferings > 0).length,
    legacyOfferingLinks: legacySubjects.reduce((count, row) => count + row.linkedOfferings, 0),
    activeGlobalSubjects: subjects.filter((row) => Boolean(row.active)).length,
    offeringImpacts,
    publicOfferingImpacts: offeringImpacts.filter((row) => Boolean(row.publicVisible)).length,
    cardSnapshotMismatches: offeringImpacts.filter((row) =>
      Boolean(row.publicVisible) && Boolean(row.offeringActive) &&
      !Boolean(row.snapshotContainsLegacyId)).length,
    assessmentLabels,
    assessmentRows: teaching?.assessments ?? 0,
    sessionRows: teaching?.sessions ?? 0,
  };
}

export type CanonicalSubjectDirectory = Awaited<ReturnType<typeof getCanonicalSubjectDirectory>>;
