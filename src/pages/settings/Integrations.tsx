import { useCallback, useEffect, useState } from "react";
import { Bot, Mail } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { IntegrationCard, type IntegrationCardStatus } from "@/components/settings/IntegrationCard";
import { EmailIntegrationForm } from "@/components/shared/EmailIntegrationForm";
import { AgentProviderSettingsForm } from "@/components/shared/AgentProviderSettingsForm";
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
import type { Event } from "@/data/types";

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
  const [emailStatus, setEmailStatus] = useState<IntegrationCardStatus>("not_connected");
  const [emailDetail, setEmailDetail] = useState<string>();
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [agentStatus, setAgentStatus] = useState<IntegrationCardStatus>("not_connected");
  const [agentDetail, setAgentDetail] = useState<string>();
  const [agentModalOpen, setAgentModalOpen] = useState(false);

  const loadAgentStatus = useCallback(async (eventId: Event["id"]) => {
    try { const setting = await repo.agentProviderSettings.status({ eventId }); setAgentStatus(setting.status === "ready" ? "connected" : "error"); setAgentDetail(setting.mode === "managed" ? "Namos managed" : "Organizer key"); }
    catch { setAgentStatus("not_connected"); setAgentDetail(undefined); }
  }, [repo]);

  const loadEmailStatus = useCallback(
    async (eventId: Event["id"]) => {
      try {
        const integration = await repo.emailIntegrations.status({ eventId });
        if (!integration) {
          setEmailStatus("not_connected");
          setEmailDetail(undefined);
          return;
        }
        setEmailStatus(integration.status === "error" ? "error" : "connected");
        setEmailDetail(providerLabel[integration.provider]);
      } catch {
        // The card falls back to "Not connected" rather than surfacing a page-level error —
        // the modal's own form re-fetches and reports load failures in context.
        setEmailStatus("not_connected");
        setEmailDetail(undefined);
      }
    },
    [repo],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEvent(activeEvent);
      setError(undefined);
      if (activeEvent) await Promise.all([loadEmailStatus(activeEvent.id), loadAgentStatus(activeEvent.id)]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load integrations.");
    } finally {
      setLoading(false);
    }
  }, [activeEvent, loadAgentStatus, loadEmailStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  const closeEmailModal = (open: boolean) => {
    setEmailModalOpen(open);
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
              name="Email delivery"
              description="Connect Resend or Amazon SES to send confirmations, decisions, and reminders."
              status={emailStatus}
              detail={emailDetail}
              onOpen={() => setEmailModalOpen(true)}
            />
            <IntegrationCard icon={Bot} name="Operations Agent AI" description="Choose Namos-managed AI or connect this event's own OpenAI key." status={agentStatus} detail={agentDetail} onOpen={() => setAgentModalOpen(true)} />
          </div>
        ) : (
          <div className={cardSurfaceClasses("default", "bg-muted/60 p-6")}>
            <p className="text-sm text-muted-foreground">
              Create an event before connecting an integration.
            </p>
          </div>
        )}
      </div>

      <Dialog open={emailModalOpen} onOpenChange={closeEmailModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Email delivery</DialogTitle>
            <DialogDescription>
              Connect the provider this event uses to send confirmations, decisions, reminders,
              and calendar invites. Credentials are encrypted and never shown again on this
              screen.
            </DialogDescription>
          </DialogHeader>
          {event && <EmailIntegrationForm eventId={event.id} />}
        </DialogContent>
      </Dialog>
      <Dialog open={agentModalOpen} onOpenChange={(open) => { setAgentModalOpen(open); if (!open && event) void loadAgentStatus(event.id); }}>
        <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Operations Agent AI</DialogTitle><DialogDescription>Choose who provides and pays for model usage on new Operations Agent runs for this event.</DialogDescription></DialogHeader>{event && <AgentProviderSettingsForm eventId={event.id} onSaved={() => void loadAgentStatus(event.id)} />}</DialogContent>
      </Dialog>
    </AppLayout>
  );
}
import { cardSurfaceClasses } from "@/components/ui/card";
