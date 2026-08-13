-- Tasks + UX hardening wave 2

ALTER TABLE tasks ADD COLUMN notes TEXT;
ALTER TABLE tasks ADD COLUMN evidence_links TEXT;

CREATE TABLE IF NOT EXISTS task_packs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  framework_slug TEXT NOT NULL,
  name TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS task_pack_items (
  id TEXT PRIMARY KEY,
  task_pack_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  default_priority TEXT NOT NULL DEFAULT 'medium',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_task_packs_org_framework ON task_packs (organization_id, framework_slug);
CREATE UNIQUE INDEX idx_task_packs_org_framework_name ON task_packs (organization_id, framework_slug, name);
CREATE INDEX idx_task_pack_items_pack_order ON task_pack_items (task_pack_id, sort_order);
CREATE UNIQUE INDEX idx_task_pack_items_pack_title ON task_pack_items (task_pack_id, title);
CREATE INDEX idx_tasks_org_status_updated ON tasks (organization_id, status, updated_at);

UPDATE tasks
SET status = CASE
  WHEN status = 'open' THEN 'todo'
  WHEN status = 'complete' THEN 'done'
  ELSE status
END
WHERE status IN ('open', 'complete');

INSERT OR IGNORE INTO task_packs (id, organization_id, framework_slug, name, summary, created_at, updated_at)
SELECT lower(hex(randomblob(16))), o.id, 'soc2', 'Access Control Hardening',
  'Identity and least-privilege work needed before audit evidence collection.',
  datetime('now'), datetime('now')
FROM organizations o;

INSERT OR IGNORE INTO task_packs (id, organization_id, framework_slug, name, summary, created_at, updated_at)
SELECT lower(hex(randomblob(16))), o.id, 'gdpr', 'Privacy Operations Foundation',
  'Data mapping, legal basis documentation, and DSAR readiness.',
  datetime('now'), datetime('now')
FROM organizations o;

INSERT OR IGNORE INTO task_packs (id, organization_id, framework_slug, name, summary, created_at, updated_at)
SELECT lower(hex(randomblob(16))), o.id, 'ccpa', 'Consumer Rights Readiness',
  'Public disclosures and handling consumer rights requests.',
  datetime('now'), datetime('now')
FROM organizations o;

INSERT OR IGNORE INTO task_packs (id, organization_id, framework_slug, name, summary, created_at, updated_at)
SELECT lower(hex(randomblob(16))), o.id, 'iso27001', 'ISMS Baseline Readiness',
  'Initial ISMS rollout with risk, policy, and control ownership setup.',
  datetime('now'), datetime('now')
FROM organizations o;

INSERT OR IGNORE INTO task_pack_items (id, task_pack_id, title, description, default_priority, sort_order)
SELECT lower(hex(randomblob(16))), p.id, 'Review all privileged roles',
  'Validate privileged access aligns with job function and approvals are documented.',
  'high', 1
FROM task_packs p
WHERE p.framework_slug = 'soc2' AND p.name = 'Access Control Hardening';

INSERT OR IGNORE INTO task_pack_items (id, task_pack_id, title, description, default_priority, sort_order)
SELECT lower(hex(randomblob(16))), p.id, 'Enable MFA for admin paths',
  'Require MFA on production/admin systems and document enforcement.',
  'high', 2
FROM task_packs p
WHERE p.framework_slug = 'soc2' AND p.name = 'Access Control Hardening';

INSERT OR IGNORE INTO task_pack_items (id, task_pack_id, title, description, default_priority, sort_order)
SELECT lower(hex(randomblob(16))), p.id, 'Create quarterly access review cadence',
  'Set recurring review process for role membership and dormant accounts.',
  'medium', 3
FROM task_packs p
WHERE p.framework_slug = 'soc2' AND p.name = 'Access Control Hardening';

INSERT OR IGNORE INTO task_pack_items (id, task_pack_id, title, description, default_priority, sort_order)
SELECT lower(hex(randomblob(16))), p.id, 'Document processing activities (RoPA)',
  'Capture data categories, purpose, retention, and legal basis by system.',
  'high', 1
FROM task_packs p
WHERE p.framework_slug = 'gdpr' AND p.name = 'Privacy Operations Foundation';

INSERT OR IGNORE INTO task_pack_items (id, task_pack_id, title, description, default_priority, sort_order)
SELECT lower(hex(randomblob(16))), p.id, 'Implement DSAR intake workflow',
  'Create triage and SLA process for access, correction, deletion, portability requests.',
  'high', 2
FROM task_packs p
WHERE p.framework_slug = 'gdpr' AND p.name = 'Privacy Operations Foundation';

INSERT OR IGNORE INTO task_pack_items (id, task_pack_id, title, description, default_priority, sort_order)
SELECT lower(hex(randomblob(16))), p.id, 'Review retention and deletion rules',
  'Align retention windows and deletion routines with policy obligations.',
  'medium', 3
FROM task_packs p
WHERE p.framework_slug = 'gdpr' AND p.name = 'Privacy Operations Foundation';

INSERT OR IGNORE INTO task_pack_items (id, task_pack_id, title, description, default_priority, sort_order)
SELECT lower(hex(randomblob(16))), p.id, 'Update privacy notice for CCPA',
  'List personal information categories, purposes, and rights language.',
  'high', 1
FROM task_packs p
WHERE p.framework_slug = 'ccpa' AND p.name = 'Consumer Rights Readiness';

INSERT OR IGNORE INTO task_pack_items (id, task_pack_id, title, description, default_priority, sort_order)
SELECT lower(hex(randomblob(16))), p.id, 'Stand up rights request process',
  'Implement verification, fulfillment tracking, and exception handling.',
  'high', 2
FROM task_packs p
WHERE p.framework_slug = 'ccpa' AND p.name = 'Consumer Rights Readiness';

INSERT OR IGNORE INTO task_pack_items (id, task_pack_id, title, description, default_priority, sort_order)
SELECT lower(hex(randomblob(16))), p.id, 'Audit third-party data disclosures',
  'Map data disclosures and ensure contract terms align with CCPA obligations.',
  'medium', 3
FROM task_packs p
WHERE p.framework_slug = 'ccpa' AND p.name = 'Consumer Rights Readiness';

INSERT OR IGNORE INTO task_pack_items (id, task_pack_id, title, description, default_priority, sort_order)
SELECT lower(hex(randomblob(16))), p.id, 'Scope ISO 27001 requirements',
  'Define in-scope systems, owners, and control boundaries for the ISMS.',
  'high', 1
FROM task_packs p
WHERE p.framework_slug = 'iso27001' AND p.name = 'ISMS Baseline Readiness';

INSERT OR IGNORE INTO task_pack_items (id, task_pack_id, title, description, default_priority, sort_order)
SELECT lower(hex(randomblob(16))), p.id, 'Run ISO 27001 gap assessment',
  'Document current-state vs required-state gaps and remediation owners.',
  'high', 2
FROM task_packs p
WHERE p.framework_slug = 'iso27001' AND p.name = 'ISMS Baseline Readiness';

INSERT OR IGNORE INTO task_pack_items (id, task_pack_id, title, description, default_priority, sort_order)
SELECT lower(hex(randomblob(16))), p.id, 'Build evidence checklist by control',
  'Assign evidence owners and due dates for prioritized controls.',
  'medium', 3
FROM task_packs p
WHERE p.framework_slug = 'iso27001' AND p.name = 'ISMS Baseline Readiness';
