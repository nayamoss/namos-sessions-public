CREATE TABLE IF NOT EXISTS questionnaires (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  requester TEXT NOT NULL DEFAULT '',
  requester_email TEXT,
  deadline TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  total_questions INTEGER NOT NULL DEFAULT 0,
  answered_questions INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_questionnaires_org_status
  ON questionnaires (organization_id, status);

CREATE TABLE IF NOT EXISTS questionnaire_questions (
  id TEXT PRIMARY KEY,
  questionnaire_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  question_text TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  response_text TEXT NOT NULL DEFAULT '',
  response_status TEXT NOT NULL DEFAULT 'empty',
  source TEXT NOT NULL DEFAULT 'manual',
  notes TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_questionnaire_questions_parent
  ON questionnaire_questions (questionnaire_id, order_index);

CREATE INDEX IF NOT EXISTS idx_questionnaire_questions_org
  ON questionnaire_questions (organization_id, questionnaire_id);

CREATE TABLE IF NOT EXISTS questionnaire_response_library (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  question_pattern TEXT NOT NULL,
  approved_response TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  last_used_at TEXT,
  use_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_response_library_org
  ON questionnaire_response_library (organization_id, category);
