-- Dev-only cutover: one reusable global subject master.
-- The owner requested deletion of the obsolete class-specific subject data.
-- Preserve staff, students, admissions, financial history and global subjects.
DROP TRIGGER IF EXISTS publish_subject_assignment;
DROP TRIGGER IF EXISTS unpublish_subject_assignment;
DROP TRIGGER IF EXISTS update_linked_subject_cards;
DROP TABLE academy_offering_subjects;
DROP INDEX IF EXISTS idx_academy_subjects_grade;
DROP TABLE academy_subjects;

-- Old programme subject selections are deliberately cleared, not guessed by name.
UPDATE public_programme_offerings
SET subjects_json='[]', version=version+1
WHERE subjects_json<>'[]';

-- Offering subject is a relationship, NOT another subject definition.
CREATE TABLE academy_offering_subjects (
 offering_id TEXT NOT NULL REFERENCES public_programme_offerings(id) ON DELETE RESTRICT,
 subject_id TEXT NOT NULL REFERENCES academic_subjects(id) ON DELETE RESTRICT,
 assigned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 sort_order INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(offering_id,subject_id)
);
CREATE INDEX idx_offering_subjects_subject ON academy_offering_subjects(subject_id);

-- The global subject is independent of Class and Group.
ALTER TABLE academic_subjects DROP COLUMN class_grade;
ALTER TABLE academic_subjects DROP COLUMN group_name;

CREATE TRIGGER publish_subject_assignment
AFTER INSERT ON academy_offering_subjects
BEGIN
 UPDATE public_programme_offerings SET
 subjects_json=(SELECT json_group_array(json_object('id',id,'code',code,'name',title))
   FROM (SELECT s.id,s.code,s.title FROM academy_offering_subjects j
         JOIN academic_subjects s ON s.id=j.subject_id
         WHERE j.offering_id=NEW.offering_id AND s.active=1
         ORDER BY j.sort_order,j.subject_id)),
 version=version+1
 WHERE id=NEW.offering_id;
END;

CREATE TRIGGER unpublish_subject_assignment
AFTER DELETE ON academy_offering_subjects
BEGIN
 UPDATE public_programme_offerings SET
 subjects_json=(SELECT json_group_array(json_object('id',id,'code',code,'name',title))
   FROM (SELECT s.id,s.code,s.title FROM academy_offering_subjects j
         JOIN academic_subjects s ON s.id=j.subject_id
         WHERE j.offering_id=OLD.offering_id AND s.active=1
         ORDER BY j.sort_order,j.subject_id)),
 version=version+1
 WHERE id=OLD.offering_id;
END;

CREATE TRIGGER update_linked_subject_cards
AFTER UPDATE OF title,code,active ON academic_subjects
BEGIN
 UPDATE public_programme_offerings SET
 subjects_json=(SELECT json_group_array(json_object('id',id,'code',code,'name',title))
   FROM (SELECT s.id,s.code,s.title FROM academy_offering_subjects j
         JOIN academic_subjects s ON s.id=j.subject_id
         WHERE j.offering_id=public_programme_offerings.id AND s.active=1
         ORDER BY j.sort_order,j.subject_id)),
 version=version+1
 WHERE id IN (SELECT offering_id FROM academy_offering_subjects WHERE subject_id=NEW.id);
END;
