-- Protect staff programme edits against simultaneous updates.
ALTER TABLE public_programme_offerings ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1);
