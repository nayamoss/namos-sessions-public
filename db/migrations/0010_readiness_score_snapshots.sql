CREATE TABLE IF NOT EXISTS readiness_score_snapshots (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  overall_score INTEGER NOT NULL,
  framework_scores TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_readiness_snapshots_org_date
  ON readiness_score_snapshots (organization_id, snapshot_date);

CREATE INDEX IF NOT EXISTS idx_readiness_snapshots_org
  ON readiness_score_snapshots (organization_id, snapshot_date DESC);
