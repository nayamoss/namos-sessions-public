-- Multi-tenant hardening wave 1

ALTER TABLE frameworks ADD COLUMN organization_id TEXT;
ALTER TABLE controls ADD COLUMN organization_id TEXT;
ALTER TABLE notifications ADD COLUMN organization_id TEXT;
ALTER TABLE monitoring_schedules ADD COLUMN organization_id TEXT;

CREATE INDEX idx_frameworks_org_slug ON frameworks (organization_id, slug);
CREATE INDEX idx_controls_org_framework ON controls (organization_id, framework_id);
CREATE INDEX idx_controls_org_updated ON controls (organization_id, updated_at);
CREATE INDEX idx_notifications_org_created ON notifications (organization_id, created_at);
CREATE INDEX idx_monitoring_schedules_org_integration ON monitoring_schedules (organization_id, integration_id);
