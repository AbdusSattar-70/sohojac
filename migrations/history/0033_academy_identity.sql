-- Staff-confirmed academy identity. No campus or identity is seeded.
CREATE TABLE IF NOT EXISTS academy_identity (
 id TEXT PRIMARY KEY CHECK(id='academy'),
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 160),
 confirmed_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 confirmed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
