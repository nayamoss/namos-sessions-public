import { useCallback, useEffect, useState } from "react";
import { Bot, FileText, Globe, Mail, Server, Table } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { IntegrationCard, type IntegrationCardStatus } from "@/components/settings/IntegrationCard";
import { EmailIntegrationForm } from "@/components/shared/EmailIntegrationForm";
import { AgentProviderSettingsForm } from "@/components/shared/AgentProviderSettingsForm";
import { NotionIntegrationForm } from "@/components/shared/NotionIntegrationForm";
import { AirtableIntegrationForm } from "@/components/shared/AirtableIntegrationForm";
import { SanityIntegrationForm } from "@/components/shared/SanityIntegrationForm";
import { SkeletonList } from "@/components/shared/SkeletonList";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRepo } from "@/data/repo";
import { providerLabel } from "@/lib/email-integration-form";
import type { ContentIntegration, EmailIntegration, EmailProvider, Event } from "@/data/types";

/**
 * Settings > Integrations. A card grid, one card per connectable provider, each opening a
 * dedicated modal for connect/test/disconnect. Today there's exactly one card (event email
 * delivery); the grid exists so future integrations (e.g. outbound webhooks) get the same
 * home instead of another one-off settings page.
 */
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

  const loadAgentStatus = useCallback(async (eventId: Event["id"]) => {
    try { const setting = await repo.agentProviderSettings.status({ eventId }); setAgentStatus(setting.status === "ready" ? "connected" : "error"); setAgentDetail(setting.mode === "managed" ? "Namos managed" : "Organizer key"); }
    catch { setAgentStatus("not_connected"); setAgentDetail(undefined); }
  }, [repo]);

  const loadEmailStatus = useCallback(
    async (eventId: Event["id"]) => {
      try {
        const integration = await repo.emailIntegrations.status({ eventId });
        if (!integration) {
          setEmailIntegration(null);
          return;
        }
        setEmailIntegration(integration);
      } catch {
        // The card falls back to "Not connected" rather than surfacing a page-level error —
        // the modal's own form re-fetches and reports load failures in context.
        setEmailIntegration(null);
      }
    },
    [repo],
  );

  const loadNotionStatus = useCallback(
    async (eventId: Event["id"]) => {
      try {
        const integration = await repo.contentIntegrations.status({ eventId, provider: "notion" });
        setNotionIntegration(integration);
      } catch {
        // Same fallback rule as email: the card shows "Not connected" and the modal's own
        // form reports load failures in context.
        setNotionIntegration(null);
      }
    },
    [repo],
  );

  const loadAirtableStatus = useCallback(
    async (eventId: Event["id"]) => {
      try {
        const integration = await repo.contentIntegrations.status({ eventId, provider: "airtable" });
        setAirtableIntegration(integration);
      } catch {
        setAirtableIntegration(null);
      }
    },
    [repo],
  );

  const loadSanityStatus = useCallback(
    async (eventId: Event["id"]) => {
      try {
        const integration = await repo.contentIntegrations.status({ eventId, provider: "sanity" });
        setSanityIntegration(integration);
      } catch {
        setSanityIntegration(null);
      }
    },
    [repo],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEvent(activeEvent);
      setError(undefined);
      if (activeEvent) await Promise.all([loadEmailStatus(activeEvent.id), loadAgentStatus(activeEvent.id), loadNotionStatus(activeEvent.id), loadAirtableStatus(activeEvent.id), loadSanityStatus(activeEvent.id)]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load integrations.");
    } finally {
      setLoading(false);
    }
  }, [activeEvent, loadAgentStatus, loadAirtableStatus, loadEmailStatus, loadNotionStatus, loadSanityStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  const closeEmailModal = (open: boolean) => {
    if (!open) setEmailProviderModal(null);
    // Refresh the card's status the moment the modal closes, so a save/disconnect inside it
    // is reflected without the organizer having to leave and return to the page.
    if (!open && event) void loadEmailStatus(event.id);
  };

  return (
    <AppLayout title="Integrations">
      <div className="space-y-4">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {loading ? (
          <SkeletonList rows={3} label="Loading integrations…" />
        ) : event ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <IntegrationCard
              icon={Mail}
              name="Resend"
              description="Connect Resend for transactional event email with an API key."
              status={emailIntegration?.provider === "resend" ? (emailIntegration.status === "error" ? "error" : "connected") : "not_connected"}
              detail={emailIntegration?.provider === "resend" ? providerLabel.resend : undefined}
              onOpen={() => setEmailProviderModal("resend")}
            />
            <IntegrationCard
              icon={Server}
              name="Amazon SES"
              description="Connect Amazon SES using AWS access keys or SMTP credentials."
              status={emailIntegration?.provider === "ses" ? (emailIntegration.status === "error" ? "error" : "connected") : "not_connected"}
              detail={emailIntegration?.provider === "ses" ? providerLabel.ses : undefined}
              onOpen={() => setEmailProviderModal("ses")}
            />
            <IntegrationCard icon={Bot} name="Operations Agent AI" description="Choose Namos-managed AI or connect this event's own OpenAI key." status={agentStatus} detail={agentDetail} onOpen={() => setAgentModalOpen(true)} />
          </div>
        ) : (
          <div className={cardSurfaceClasses("default", "bg-muted/60 p-6")}>
            <p className="text-base text-muted-foreground">
              Create an event before connecting an integration.
            </p>
          </div>
        )}
        {!loading && event && (
          <>
            <h2 className="text-base font-semibold">Content sources</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <IntegrationCard
                icon={FileText}
                name="Notion"
                description="Import speakers or submissions from a Notion database."
                status={notionIntegration ? (notionIntegration.status === "error" ? "error" : "connected") : "not_connected"}
                detail={notionIntegration ? `Imports into ${notionIntegration.target}` : undefined}
                onOpen={() => setNotionModalOpen(true)}
              />
              <IntegrationCard
                icon={Table}
                name="Airtable"
                description="Import speakers or submissions from an Airtable base."
                status={airtableIntegration ? (airtableIntegration.status === "error" ? "error" : "connected") : "not_connected"}
                detail={airtableIntegration ? `Imports into ${airtableIntegration.target}` : undefined}
                onOpen={() => setAirtableModalOpen(true)}
              />
              <IntegrationCard
                icon={Globe}
                name="Sanity"
                description="Publish confirmed sessions and speakers to a Sanity dataset."
                status={sanityIntegration ? (sanityIntegration.status === "error" ? "error" : "connected") : "not_connected"}
                detail={sanityIntegration?.config?.sanityDataset ? `Publishing to ${sanityIntegration.config.sanityDataset}` : undefined}
                onOpen={() => setSanityModalOpen(true)}
              />
            </div>
          </>
        )}
      </div>

      <Dialog open={emailProviderModal !== null} onOpenChange={closeEmailModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{emailProviderModal ? `Connect ${providerLabel[emailProviderModal]}` : "Email delivery"}</DialogTitle>
            <DialogDescription>
              Connect this provider to send confirmations, decisions, reminders, and calendar invites.
              One provider is active per event; changing it replaces the existing connection.
            </DialogDescription>
          </DialogHeader>
          {event && emailProviderModal && <EmailIntegrationForm eventId={event.id} provider={emailProviderModal} />}
        </DialogContent>
      </Dialog>
      <Dialog open={agentModalOpen} onOpenChange={(open) => { setAgentModalOpen(open); if (!open && event) void loadAgentStatus(event.id); }}>
        <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Operations Agent AI</DialogTitle><DialogDescription>Choose who provides and pays for model usage on new Operations Agent runs for this event.</DialogDescription></DialogHeader>{event && <AgentProviderSettingsForm eventId={event.id} onSaved={() => void loadAgentStatus(event.id)} />}</DialogContent>
      </Dialog>
      <Dialog open={notionModalOpen} onOpenChange={(open) => { setNotionModalOpen(open); if (!open && event) void loadNotionStatus(event.id); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Notion</DialogTitle>
            <DialogDescription>
              Import speakers or submissions from a Notion database. Re-running "Import now"
              updates existing rows instead of duplicating them.
            </DialogDescription>
          </DialogHeader>
          {event && <NotionIntegrationForm eventId={event.id} />}
        </DialogContent>
      </Dialog>
      <Dialog open={airtableModalOpen} onOpenChange={(open) => { setAirtableModalOpen(open); if (!open && event) void loadAirtableStatus(event.id); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Airtable</DialogTitle>
            <DialogDescription>
              Import speakers or submissions from an Airtable base. Re-running "Import now"
              updates existing rows instead of duplicating them.
            </DialogDescription>
          </DialogHeader>
          {event && <AirtableIntegrationForm eventId={event.id} />}
        </DialogContent>
      </Dialog>
      <Dialog open={sanityModalOpen} onOpenChange={(open) => { setSanityModalOpen(open); if (!open && event) void loadSanityStatus(event.id); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sanity</DialogTitle>
            <DialogDescription>
              Publish this event&apos;s public program to Sanity. Re-running &quot;Publish now&quot;
              updates the same documents instead of duplicating them.
            </DialogDescription>
          </DialogHeader>
          {event && <SanityIntegrationForm eventId={event.id} />}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
import { cardSurfaceClasses } from "@/components/ui/card";
