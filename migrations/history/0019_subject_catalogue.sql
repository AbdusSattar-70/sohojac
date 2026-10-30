-- Subjects are managed by staff. Initial reference data is preserved from the
-- existing public catalogue (never generated demo students or transactions).
CREATE TABLE IF NOT EXISTS academy_subjects (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL CHECK(length(code) BETWEEN 2 AND 16),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 120),
  class_grade INTEGER NOT NULL CHECK(class_grade BETWEEN 4 AND 12),
  group_name TEXT NOT NULL CHECK(group_name IN ('GENERAL','SCIENCE','BUSINESS','HUMANITIES')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(code,class_grade,group_name)
);
CREATE INDEX IF NOT EXISTS idx_academy_subjects_grade ON academy_subjects(class_grade,group_name,active);

CREATE TABLE IF NOT EXISTS academy_offering_subjects (
  offering_id TEXT NOT NULL REFERENCES public_programme_offerings(id) ON DELETE RESTRICT,
  subject_id TEXT NOT NULL REFERENCES academy_subjects(id) ON DELETE RESTRICT,
  assigned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(offering_id,subject_id)
);

-- Reuse the actual published subject ids/names for Class 10 Science.
INSERT OR IGNORE INTO academy_subjects(id,code,name,class_grade,group_name)
SELECT json_extract(j.value,'$.id'),json_extract(j.value,'$.code'),
  json_extract(j.value,'$.name'),10,'SCIENCE'
FROM public_programme_offerings o,json_each(o.subjects_json) j
WHERE o.id='sa-ssc-science'
  AND json_valid(o.subjects_json)
  AND json_extract(j.value,'$.id') IS NOT NULL
  AND json_extract(j.value,'$.code') IS NOT NULL;

INSERT OR IGNORE INTO academy_offering_subjects(offering_id,subject_id)
SELECT 'sa-ssc-science',s.id FROM academy_subjects s
WHERE s.class_grade=10 AND s.group_name='SCIENCE'
AND EXISTS (
  SELECT 1 FROM public_programme_offerings o,json_each(o.subjects_json) j
  WHERE o.id='sa-ssc-science' AND json_extract(j.value,'$.id')=s.id
);

-- Synchronize the public JSON from the linked ERP subject register.
CREATE TRIGGER IF NOT EXISTS publish_subject_assignment
AFTER INSERT ON academy_offering_subjects
BEGIN
  UPDATE public_programme_offerings SET
    subjects_json=(SELECT json_group_array(json_object('id',s.id,'code',s.code,'name',s.name))
      FROM academy_offering_subjects j JOIN academy_subjects s ON s.id=j.subject_id
      WHERE j.offering_id=NEW.offering_id AND s.active=1),
    version=version+1
  WHERE id=NEW.offering_id;
END;

CREATE TRIGGER IF NOT EXISTS unpublish_subject_assignment
AFTER DELETE ON academy_offering_subjects
BEGIN
  UPDATE public_programme_offerings SET
    subjects_json=(SELECT json_group_array(json_object('id',s.id,'code',s.code,'name',s.name))
      FROM academy_offering_subjects j JOIN academy_subjects s ON s.id=j.subject_id
      WHERE j.offering_id=OLD.offering_id AND s.active=1),
    version=version+1
  WHERE id=OLD.offering_id;
END;

CREATE TRIGGER IF NOT EXISTS update_linked_subject_cards
AFTER UPDATE OF name,active ON academy_subjects
BEGIN
  UPDATE public_programme_offerings SET
    subjects_json=(SELECT json_group_array(json_object('id',s.id,'code',s.code,'name',s.name))
      FROM academy_offering_subjects j JOIN academy_subjects s ON s.id=j.subject_id
      WHERE j.offering_id=public_programme_offerings.id AND s.active=1),
    version=version+1
  WHERE id IN (SELECT offering_id FROM academy_offering_subjects WHERE subject_id=NEW.id);
END;
