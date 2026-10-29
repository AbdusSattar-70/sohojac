-- Preserve the existing public_programme_offerings catalogue; do not create
-- a parallel offerings table, auto-map uncertain legacy records, or publish data.
-- The original ERP's UUID-based academic links are optional for legacy rows.
CREATE TABLE IF NOT EXISTS academy_branches (
 id TEXT PRIMARY KEY NOT NULL,
 code TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL,
 is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
ALTER TABLE public_programme_offerings ADD COLUMN branch_id TEXT REFERENCES academy_branches(id) ON DELETE RESTRICT;
ALTER TABLE public_programme_offerings ADD COLUMN academic_year_id TEXT REFERENCES academic_years(id) ON DELETE RESTRICT;
ALTER TABLE public_programme_offerings ADD COLUMN class_id TEXT REFERENCES academy_classes(id) ON DELETE RESTRICT;
ALTER TABLE public_programme_offerings ADD COLUMN program_id TEXT REFERENCES academy_programmes(id) ON DELETE RESTRICT;
ALTER TABLE public_programme_offerings ADD COLUMN group_id TEXT REFERENCES academic_groups(id) ON DELETE RESTRICT;
ALTER TABLE public_programme_offerings ADD COLUMN operation_kind TEXT CHECK(operation_kind IN ('SCHOOL','COACHING','TRAINING'));
ALTER TABLE public_programme_offerings ADD COLUMN teaching_starts_on TEXT;
ALTER TABLE public_programme_offerings ADD COLUMN teaching_ends_on TEXT;
ALTER TABLE public_programme_offerings ADD COLUMN offering_status TEXT CHECK(offering_status IN ('DRAFT','ACTIVE','RETIRED'));
ALTER TABLE public_programme_offerings ADD COLUMN allowed_discount_percentages_json TEXT
  NOT NULL DEFAULT '[]' CHECK(json_valid(allowed_discount_percentages_json));
ALTER TABLE public_programme_offerings ADD COLUMN source_updated_at TEXT;
CREATE INDEX IF NOT EXISTS idx_public_offering_academic_links
 ON public_programme_offerings(academic_year_id,class_id,program_id,group_id);
CREATE INDEX IF NOT EXISTS idx_public_offering_branch_kind
 ON public_programme_offerings(branch_id,operation_kind);
