CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  reference TEXT,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'Other',
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'detected',
  owner TEXT,
  affected_systems TEXT,
  detected_at TEXT,
  resolved_at TEXT,
  is_breach INTEGER NOT NULL DEFAULT 0,
  breach_notified INTEGER NOT NULL DEFAULT 0,
  breach_notified_at TEXT,
  root_cause TEXT,
  remediation TEXT,
  lessons_learned TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_incidents_org
  ON incidents (organization_id, detected_at DESC);
