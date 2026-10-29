-- Add only master-data registers absent from the existing Cloudflare D1 schema.
-- Existing academy_years, academic_subjects and academy_programmes are reused.
-- No seed rows, destructive alterations, or parallel copies of these entities.
CREATE TABLE IF NOT EXISTS academy_classes (
 id TEXT PRIMARY KEY NOT NULL,
 code TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL,
 sort_order INTEGER NOT NULL DEFAULT 100 CHECK(sort_order BETWEEN 0 AND 9999),
 is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS academic_groups (
 id TEXT PRIMARY KEY NOT NULL,
 code TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL,
 is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS academy_areas (
 id TEXT PRIMARY KEY NOT NULL,
 name TEXT NOT NULL UNIQUE,
 is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1))
);
CREATE TABLE IF NOT EXISTS academy_schools (
 id TEXT PRIMARY KEY NOT NULL,
 name TEXT NOT NULL,
 area_id TEXT REFERENCES academy_areas(id) ON DELETE RESTRICT,
 is_verified INTEGER NOT NULL DEFAULT 0 CHECK(is_verified IN (0,1)),
 is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_academy_schools_name ON academy_schools(name);
CREATE TABLE IF NOT EXISTS academy_lead_sources (
 id TEXT PRIMARY KEY NOT NULL,
 code TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL,
 is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS academy_guardian_relationships (
 id TEXT PRIMARY KEY NOT NULL,
 code TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL,
 is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
