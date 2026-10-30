CREATE TABLE IF NOT EXISTS system_maintenance_operations (id TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('PREPARED','COMPLETE')), manifest_json TEXT NOT NULL, completed_at TEXT);
