-- C3b: optimistic concurrency on every Academic Setup entity.
-- No destructive operations, no data reset; existing rows start at version 1.
ALTER TABLE academy_classes ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1);
ALTER TABLE academic_groups ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1);
ALTER TABLE academic_subjects ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1);
ALTER TABLE academy_programmes ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1);
ALTER TABLE academy_schools ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1);
ALTER TABLE academy_lead_sources ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1);
ALTER TABLE academy_guardian_relationships ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1);

-- Enforce revision changes even when an older permitted API edits master data.
CREATE TRIGGER academy_classes_bump_revision
AFTER UPDATE ON academy_classes
WHEN NEW.version=OLD.version
BEGIN
 UPDATE academy_classes SET version=OLD.version+1 WHERE id=NEW.id;
END;
CREATE TRIGGER academic_groups_bump_revision
AFTER UPDATE ON academic_groups
WHEN NEW.version=OLD.version
BEGIN
 UPDATE academic_groups SET version=OLD.version+1 WHERE id=NEW.id;
END;
CREATE TRIGGER academic_subjects_bump_revision
AFTER UPDATE ON academic_subjects
WHEN NEW.version=OLD.version
BEGIN
 UPDATE academic_subjects SET version=OLD.version+1 WHERE id=NEW.id;
END;
CREATE TRIGGER academy_programmes_bump_revision
AFTER UPDATE ON academy_programmes
WHEN NEW.version=OLD.version
BEGIN
 UPDATE academy_programmes SET version=OLD.version+1 WHERE id=NEW.id;
END;
CREATE TRIGGER academy_schools_bump_revision
AFTER UPDATE ON academy_schools
WHEN NEW.version=OLD.version
BEGIN
 UPDATE academy_schools SET version=OLD.version+1 WHERE id=NEW.id;
END;
CREATE TRIGGER academy_lead_sources_bump_revision
AFTER UPDATE ON academy_lead_sources
WHEN NEW.version=OLD.version
BEGIN
 UPDATE academy_lead_sources SET version=OLD.version+1 WHERE id=NEW.id;
END;
CREATE TRIGGER academy_guardian_relationships_bump_revision
AFTER UPDATE ON academy_guardian_relationships
WHEN NEW.version=OLD.version
BEGIN
 UPDATE academy_guardian_relationships SET version=OLD.version+1 WHERE id=NEW.id;
END;
