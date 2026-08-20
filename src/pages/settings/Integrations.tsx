import { useCallback, useEffect, useState } from "react";
import { useCurrentEvent } from "@/components/EventContext";
import { IntegrationBrandIcon } from "@/components/settings/IntegrationBrandIcon";
import { IntegrationCard, type IntegrationCardStatus } from "@/components/settings/IntegrationCard";
import { AgentProviderSettingsForm } from "@/components/shared/AgentProviderSettingsForm";
import { AirtableIntegrationForm } from "@/components/shared/AirtableIntegrationForm";
import { EmailIntegrationForm } from "@/components/shared/EmailIntegrationForm";
import { NotionIntegrationForm } from "@/components/shared/NotionIntegrationForm";
import { SanityIntegrationForm } from "@/components/shared/SanityIntegrationForm";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { EmptyState } from "@/components/shared/EmptyState";
import { Plug } from "lucide-react";
import { SlackIntegrationForm } from "@/components/shared/SlackIntegrationForm";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRepo } from "@/data/repo";
import type { ContentIntegration, EmailIntegration, EmailProvider, Event, SlackIntegrationStatus } from "@/data/types";
import { providerLabel } from "@/lib/email-integration-form";

export default function Integrations() {
  const repo = useRepo();
  const { event: activeEvent } = useCurrentEvent();
  const [event, setEvent] = useState<Event>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [emailIntegration, setEmailIntegration] = useState<EmailIntegration | null>(null);
  const [emailProviderModal, setEmailProviderModal] = useState<EmailProvider | null>(null);
  const [agentStatus, setAgentStatus] = useState<IntegrationCardStatus>("not_connected");
  const [agentDetail, setAgentDetail] = useState<string>();
  const [agentModalOpen, setAgentModalOpen] = useState(false);
  const [notionIntegration, setNotionIntegration] = useState<ContentIntegration | null>(null);
  const [notionModalOpen, setNotionModalOpen] = useState(false);
  const [airtableIntegration, setAirtableIntegration] = useState<ContentIntegration | null>(null);
  const [airtableModalOpen, setAirtableModalOpen] = useState(false);
  const [sanityIntegration, setSanityIntegration] = useState<ContentIntegration | null>(null);
  const [sanityModalOpen, setSanityModalOpen] = useState(false);
  const [slackStatus, setSlackStatus] = useState<SlackIntegrationStatus>({ state: "not_connected" });
  const [slackModalOpen, setSlackModalOpen] = useState(false);

  const loadAgentStatus = useCallback(async (eventId: Event["id"]) => {
    try {
      const setting = await repo.agentProviderSettings.status({ eventId });
      setAgentStatus(setting.status === "ready" ? "connected" : "error");
      setAgentDetail(setting.mode === "managed" ? "Namos managed" : "Organizer key");
    } catch { setAgentStatus("not_connected"); setAgentDetail(undefined); }
  }, [repo]);
  const loadEmailStatus = useCallback(async (eventId: Event["id"]) => {
    try { setEmailIntegration(await repo.emailIntegrations.status({ eventId })); }
    catch { setEmailIntegration(null); }
  }, [repo]);
  const loadContentStatus = useCallback(async (eventId: Event["id"], provider: "notion" | "airtable" | "sanity") => {
    try {
      const integration = await repo.contentIntegrations.status({ eventId, provider });
      if (provider === "notion") setNotionIntegration(integration);
      else if (provider === "airtable") setAirtableIntegration(integration);
      else setSanityIntegration(integration);
    } catch {
      if (provider === "notion") setNotionIntegration(null);
      else if (provider === "airtable") setAirtableIntegration(null);
      else setSanityIntegration(null);
    }
  }, [repo]);
  const loadSlackStatus = useCallback(async (eventId: Event["id"]) => {
    try { setSlackStatus(await repo.slackIntegrations.status({ eventId })); }
    catch { setSlackStatus({ state: "not_connected" }); }
  }, [repo]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEvent(activeEvent);
      setError(undefined);
      if (activeEvent) await Promise.all([
        loadEmailStatus(activeEvent.id), loadAgentStatus(activeEvent.id),
        loadContentStatus(activeEvent.id, "notion"), loadContentStatus(activeEvent.id, "airtable"),
        loadContentStatus(activeEvent.id, "sanity"), loadSlackStatus(activeEvent.id),
      ]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load integrations."); }
    finally { setLoading(false); }
  }, [activeEvent, loadAgentStatus, loadContentStatus, loadEmailStatus, loadSlackStatus]);

  useEffect(() => { void load(); }, [load]);

  const slackCardStatus: IntegrationCardStatus = slackStatus.state === "error" || (slackStatus.state !== "not_connected" && Boolean(slackStatus.lastError)) ? "error" : slackStatus.state === "not_connected" ? "not_connected" : "connected";
  const slackDetail = slackStatus.state === "workspace_connected"
    ? slackStatus.lastError ? "Needs attention" : "Workspace connected · Choose a channel"
    : slackStatus.state === "connected" ? `${slackStatus.teamName} · #${slackStatus.channelName}`
      : slackStatus.state === "error" ? "Needs attention" : undefined;

  return (
    <>
      <div className="space-y-4">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {loading ? <SkeletonList rows={3} label="Loading integrations…" /> : event ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <IntegrationCard provider="resend" name="Resend" description="Connect Resend for transactional event email with an API key." status={emailIntegration?.provider === "resend" ? emailIntegration.status === "error" ? "error" : "connected" : "not_connected"} detail={emailIntegration?.provider === "resend" ? providerLabel.resend : undefined} onOpen={() => setEmailProviderModal("resend")} />
            <IntegrationCard provider="amazon_ses" name="Amazon SES" description="Connect Amazon SES using AWS access keys or SMTP credentials." status={emailIntegration?.provider === "ses" ? emailIntegration.status === "error" ? "error" : "connected" : "not_connected"} detail={emailIntegration?.provider === "ses" ? providerLabel.ses : undefined} onOpen={() => setEmailProviderModal("ses")} />
            <IntegrationCard provider="slack" name="Slack" description="Run event operations and receive selected updates in one channel." status={slackCardStatus} detail={slackDetail} onOpen={() => setSlackModalOpen(true)} />
            <IntegrationCard provider="operations_agent" name="Operations Agent AI" description="Choose Namos-managed AI or connect this event's own OpenAI key." status={agentStatus} detail={agentDetail} onOpen={() => setAgentModalOpen(true)} />
          </div>
        ) : (
          <EmptyState icon={Plug} title="Create an event to connect integrations" />
        )}
        {!loading && event && (
          <>
            <h2 className="text-base font-semibold">Content sources</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <IntegrationCard
                provider="notion"
                name="Notion"
                description="Import speakers or submissions from a Notion database."
                status={notionIntegration ? (notionIntegration.status === "error" ? "error" : "connected") : "not_connected"}
                detail={notionIntegration ? `Imports into ${notionIntegration.target}` : undefined}
                onOpen={() => setNotionModalOpen(true)}
              />
              <IntegrationCard
                provider="airtable"
                name="Airtable"
                description="Import speakers or submissions from an Airtable base."
                status={airtableIntegration ? (airtableIntegration.status === "error" ? "error" : "connected") : "not_connected"}
                detail={airtableIntegration ? `Imports into ${airtableIntegration.target}` : undefined}
                onOpen={() => setAirtableModalOpen(true)}
              />
              <IntegrationCard
                provider="sanity"
                name="Sanity"
                description="Publish confirmed sessions and speakers to a Sanity dataset."
                status={sanityIntegration ? (sanityIntegration.status === "error" ? "error" : "connected") : "not_connected"}
                detail={sanityIntegration?.config?.sanityDataset ? `Publishing to ${sanityIntegration.config.sanityDataset}` : undefined}
                // Shipped but never verified end to end against a real Sanity project, so it
                // stays inert rather than offering a connect flow nobody has proven works.
                comingSoon
                onOpen={() => setSanityModalOpen(true)}
              />
            </div>
          </>
        )}
      </div>

      <Dialog open={emailProviderModal !== null} onOpenChange={(open) => { if (!open) setEmailProviderModal(null); if (!open && event) void loadEmailStatus(event.id); }}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle className="flex items-center gap-3">{emailProviderModal && <IntegrationBrandIcon provider={emailProviderModal === "resend" ? "resend" : "amazon_ses"} size="small" />}<span>{emailProviderModal ? `Connect ${providerLabel[emailProviderModal]}` : "Email delivery"}</span></DialogTitle><DialogDescription>Connect this provider to send confirmations, decisions, reminders, and calendar invites. One provider is active per event; changing it replaces the existing connection.</DialogDescription></DialogHeader>{event && emailProviderModal && <EmailIntegrationForm eventId={event.id} provider={emailProviderModal} />}</DialogContent></Dialog>
      <Dialog open={slackModalOpen} onOpenChange={(open) => { setSlackModalOpen(open); if (!open && event) void loadSlackStatus(event.id); }}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle className="flex items-center gap-3"><IntegrationBrandIcon provider="slack" size="small" /><span>Slack</span></DialogTitle><DialogDescription>Connect one workspace for your organization, then choose the event channel and operations that belong there.</DialogDescription></DialogHeader>{event && <SlackIntegrationForm eventId={event.id} eventSlug={event.slug} onStatusChange={setSlackStatus} />}</DialogContent></Dialog>
      <Dialog open={agentModalOpen} onOpenChange={(open) => { setAgentModalOpen(open); if (!open && event) void loadAgentStatus(event.id); }}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle className="flex items-center gap-3"><IntegrationBrandIcon provider="operations_agent" size="small" /><span>Operations Agent AI</span></DialogTitle><DialogDescription>Choose who provides and pays for model usage on new Operations Agent runs for this event.</DialogDescription></DialogHeader>{event && <AgentProviderSettingsForm eventId={event.id} onSaved={() => void loadAgentStatus(event.id)} />}</DialogContent></Dialog>
      <Dialog open={notionModalOpen} onOpenChange={(open) => { setNotionModalOpen(open); if (!open && event) void loadContentStatus(event.id, "notion"); }}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle className="flex items-center gap-3"><IntegrationBrandIcon provider="notion" size="small" /><span>Notion</span></DialogTitle><DialogDescription>Import speakers or submissions from a Notion database. Re-running Import now updates existing rows instead of duplicating them.</DialogDescription></DialogHeader>{event && <NotionIntegrationForm eventId={event.id} />}</DialogContent></Dialog>
      <Dialog open={airtableModalOpen} onOpenChange={(open) => { setAirtableModalOpen(open); if (!open && event) void loadContentStatus(event.id, "airtable"); }}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle className="flex items-center gap-3"><IntegrationBrandIcon provider="airtable" size="small" /><span>Airtable</span></DialogTitle><DialogDescription>Import speakers or submissions from an Airtable base. Re-running Import now updates existing rows instead of duplicating them.</DialogDescription></DialogHeader>{event && <AirtableIntegrationForm eventId={event.id} />}</DialogContent></Dialog>
      <Dialog open={sanityModalOpen} onOpenChange={(open) => { setSanityModalOpen(open); if (!open && event) void loadContentStatus(event.id, "sanity"); }}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle className="flex items-center gap-3"><IntegrationBrandIcon provider="sanity" size="small" /><span>Sanity</span></DialogTitle><DialogDescription>Publish this event&apos;s public program to Sanity. Re-running Publish now updates the same documents instead of duplicating them.</DialogDescription></DialogHeader>{event && <SanityIntegrationForm eventId={event.id} />}</DialogContent></Dialog>
    </>
  );
}
