-- Trust Center: per-org public compliance portal

CREATE TABLE IF NOT EXISTS trust_center_config (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL UNIQUE,
  is_published INTEGER NOT NULL DEFAULT 0,
  display_name TEXT,
  tagline TEXT,
  accent_color TEXT NOT NULL DEFAULT '#40745C',
  logo_url TEXT,
  custom_domain TEXT,
  show_certifications INTEGER NOT NULL DEFAULT 1,
  show_documents INTEGER NOT NULL DEFAULT 1,
  show_subprocessors INTEGER NOT NULL DEFAULT 1,
  show_security_faq INTEGER NOT NULL DEFAULT 1,
  nda_text TEXT,
  use_signease INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trust_center_certifications (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  framework_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  issued_date TEXT,
  expiry_date TEXT,
  auditor_name TEXT,
  cert_url TEXT,
  tier TEXT NOT NULL DEFAULT 'public',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trust_center_documents (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'Other',
  file_url TEXT,
  file_size TEXT,
  tier TEXT NOT NULL DEFAULT 'public',
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trust_center_subprocessors (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  purpose TEXT,
  data_category TEXT,
  data_location TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trust_center_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'request',
  visitor_name TEXT NOT NULL,
  visitor_email TEXT NOT NULL,
  visitor_company TEXT,
  visitor_message TEXT,
  nda_agreed INTEGER NOT NULL DEFAULT 0,
  nda_agreed_at TEXT,
  nda_ip_hash TEXT,
  signeasy_envelope_id TEXT,
  signeasy_status TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  access_token TEXT,
  access_expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trust_center_visitors (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  session_id TEXT,
  visitor_email TEXT,
  action TEXT NOT NULL,
  document_id TEXT,
  ip_hash TEXT,
  user_agent_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trust_center_subscribers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  email TEXT NOT NULL,
  subscribed_at TEXT NOT NULL,
  UNIQUE(organization_id, email)
);

CREATE INDEX IF NOT EXISTS idx_tc_config_org ON trust_center_config (organization_id);
CREATE INDEX IF NOT EXISTS idx_tc_certs_org ON trust_center_certifications (organization_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_tc_docs_org ON trust_center_documents (organization_id, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_tc_subprocessors_org ON trust_center_subprocessors (organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tc_requests_org_status ON trust_center_requests (organization_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_tc_visitors_org ON trust_center_visitors (organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tc_requests_token ON trust_center_requests (access_token);
