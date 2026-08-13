CREATE TABLE IF NOT EXISTS risks (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'Operational',
  owner TEXT,
  status TEXT NOT NULL DEFAULT 'identified',
  likelihood INTEGER NOT NULL DEFAULT 3,
  impact INTEGER NOT NULL DEFAULT 3,
  inherent_score INTEGER NOT NULL DEFAULT 9,
  risk_level TEXT NOT NULL DEFAULT 'medium',
  treatment TEXT NOT NULL DEFAULT 'mitigate',
  treatment_plan TEXT,
  residual_likelihood INTEGER NOT NULL DEFAULT 3,
  residual_impact INTEGER NOT NULL DEFAULT 3,
  residual_score INTEGER NOT NULL DEFAULT 9,
  residual_level TEXT NOT NULL DEFAULT 'medium',
  evidence_notes TEXT,
  review_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_risks_org
  ON risks (organization_id, updated_at DESC);
