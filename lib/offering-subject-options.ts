export type OfferingSubjectOption = {
  id: string;
  code: string;
  name: string;
  class_grade: number;
  group_name: string;
  active?: number;
};
export function offeringSubjectOptions(
  subjects: OfferingSubjectOption[],
  offering: {
    class_name: string;
    class_code?: string | null;
    group_name: string | null;
    operation_kind: string | null;
  },
  selectedIds: string[],
) {
  const match =
    (offering.class_code ?? "").match(/^CLASS[-_ ]?(\d{1,2})$/i) ??
    offering.class_name.match(/^Class\s+(\d{1,2})(?:\b|$)/i);
  const grade =
    offering.operation_kind === "TRAINING"
      ? null
      : match
        ? Number(match[1])
        : null;
  const group = offering.group_name?.trim().toUpperCase().replaceAll(" ", "_");
  const candidate = group === "BUSINESS_STUDIES" ? "BUSINESS" : group;
  const normalized =
    candidate && ["SCIENCE", "BUSINESS", "HUMANITIES"].includes(candidate)
      ? candidate
      : null;
  const scoped = subjects.filter(
    (s) =>
      s.active !== 0 &&
      (grade === null || s.class_grade === grade) &&
      (!normalized ||
        normalized === "GENERAL" ||
        s.group_name === "GENERAL" ||
        s.group_name === normalized),
  );
  const eligible = new Set(scoped.map((s) => s.id));
  const retained = subjects.filter(
    (s) => selectedIds.includes(s.id) && !eligible.has(s.id),
  );
  return { eligible: scoped, retained, grade };
}
export function subjectOptionLabel(subject: OfferingSubjectOption) {
  return `${subject.code} — ${subject.name} · Class ${subject.class_grade} · ${subject.group_name.replaceAll("_", " ")}${subject.active === 0 ? " · Inactive" : ""}`;
}
