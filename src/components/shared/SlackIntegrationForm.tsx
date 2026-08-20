import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Send } from "lucide-react";
import { IntegrationBrandIcon } from "@/components/settings/IntegrationBrandIcon";
import { Button } from "@/components/ui/button";
import { cardSurfaceClasses } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRepo } from "@/data/repo";
import type { EventId, SlackChannel, SlackIntegrationStatus, SlackNotificationKind } from "@/data/types";

export interface SlackIntegrationFormProps {
  eventId: EventId;
  eventSlug: string;
  onStatusChange?: (status: SlackIntegrationStatus) => void;
}

const notificationOptions: Array<{ kind: SlackNotificationKind; label: string; description: string }> = [
  { kind: "submission_received", label: "New submission received", description: "A proposal is submitted through an event form." },
  { kind: "reviewer_assigned", label: "Reviewer assigned", description: "A reviewer receives a new evaluation assignment." },
  { kind: "evaluation_completed", label: "Evaluation completed", description: "A reviewer completes an assigned evaluation." },
  { kind: "decision_sent", label: "Decision sent", description: "An acceptance or decline message is delivered." },
  { kind: "comms_delivery_failed", label: "Communication delivery failed", description: "An event message cannot be delivered." },
];
const defaultKinds = notificationOptions.map((option) => option.kind);

function message(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function SlackIntegrationForm({ eventId, eventSlug, onStatusChange }: SlackIntegrationFormProps) {
  const repo = useRepo();
  const callbackHandled = useRef(false);
  const [status, setStatus] = useState<SlackIntegrationStatus | null>(null);
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [agentEnabled, setAgentEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationKinds, setNotificationKinds] = useState<SlackNotificationKind[]>(defaultKinds);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [channelError, setChannelError] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  const [confirmDisconnectOpen, setConfirmDisconnectOpen] = useState(false);

  const applyStatus = useCallback((next: SlackIntegrationStatus) => {
    setStatus(next);
    onStatusChange?.(next);
    if (next.state === "connected" || next.state === "error") {
      setSelectedChannelId(next.channelId);
      setAgentEnabled(next.agentEnabled);
      setNotificationsEnabled(next.notificationsEnabled);
      setNotificationKinds(next.notificationKinds);
    }
  }, [onStatusChange]);

  const loadStatus = useCallback(async () => {
    const next = await repo.slackIntegrations.status({ eventId });
    applyStatus(next);
    return next;
  }, [applyStatus, eventId, repo]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if (!callbackHandled.current) {
          callbackHandled.current = true;
          const url = new URL(window.location.href);
          const result = url.searchParams.get("slack");
          const reason = url.searchParams.get("reason");
          const linkToken = url.searchParams.get("slack_link");
          url.searchParams.delete("slack");
          url.searchParams.delete("reason");
          url.searchParams.delete("slack_link");
          if (result || reason || linkToken) window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
          if (linkToken) {
            await repo.slackIntegrations.claimLink({ eventId, token: linkToken });
            if (!cancelled) setSuccess("Slack account linked for this event.");
          } else if (result === "connected" && !cancelled) setSuccess("Slack workspace connected. Choose a channel for this event.");
          else if (result === "error" && !cancelled) setError(reason === "access_denied" ? "Slack connection was cancelled." : "Slack could not be connected. Try again.");
        }
        if (!cancelled) await loadStatus();
      } catch (cause) {
        if (!cancelled) setError(message(cause, "Could not load Slack settings."));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [eventId, eventSlug, loadStatus, repo]);

  const loadChannels = async () => {
    if (isLoadingChannels) return;
    setIsLoadingChannels(true); setChannelError(undefined);
    try { setChannels((await repo.slackIntegrations.listChannels({ eventId })).channels); }
    catch (cause) { setChannelError(message(cause, "Could not load Slack channels.")); }
    finally { setIsLoadingChannels(false); }
  };

  const invalid = !agentEnabled && !notificationsEnabled || notificationsEnabled && notificationKinds.length === 0;
  const bound = status?.state === "connected" || status?.state === "error";
  const selectedChannel = channels.find((channel) => channel.id === selectedChannelId);
  const displayChannels = bound && !channels.some((channel) => channel.id === status.channelId)
    ? [{ id: status.channelId, name: status.channelName, isPrivate: status.isPrivate, isMember: true }, ...channels]
    : channels;

  const connect = async () => {
    setIsConnecting(true); setError(undefined);
    try { window.location.assign((await repo.slackIntegrations.startOAuth({ eventId })).url); }
    catch (cause) { setError(message(cause, "Could not start Slack authorization.")); setIsConnecting(false); }
  };

  const save = async () => {
    if (!selectedChannelId || invalid) return;
    setIsSaving(true); setError(undefined); setSuccess(undefined);
    try {
      if (!bound || selectedChannelId !== status.channelId) await repo.slackIntegrations.saveBinding({ eventId, channelId: selectedChannelId, agentEnabled, notificationsEnabled, notificationKinds });
      else await repo.slackIntegrations.updateBinding({ eventId, agentEnabled, notificationsEnabled, notificationKinds });
      await loadStatus();
      setSuccess("Slack settings saved.");
    } catch (cause) { setError(message(cause, "Could not save Slack settings.")); }
    finally { setIsSaving(false); }
  };

  const test = async () => {
    setIsTesting(true); setError(undefined); setSuccess(undefined);
    try { await repo.slackIntegrations.testNotification({ eventId }); setSuccess(`Test message sent to #${bound ? status.channelName : selectedChannel?.name ?? "channel"}.`); }
    catch (cause) { setError(message(cause, "Could not send the Slack test message.")); }
    finally { setIsTesting(false); }
  };

  const remove = async () => {
    setIsRemoving(true); setError(undefined);
    try { await repo.slackIntegrations.removeBinding({ eventId }); await loadStatus(); setChannels([]); setSelectedChannelId(""); setSuccess("Slack was removed from this event."); setConfirmRemoveOpen(false); }
    catch (cause) { setError(message(cause, "Could not remove Slack from this event.")); }
    finally { setIsRemoving(false); }
  };

  const disconnect = async () => {
    setIsDisconnecting(true); setError(undefined);
    try { await repo.slackIntegrations.disconnectWorkspace({ eventId }); applyStatus({ state: "not_connected" }); setChannels([]); setSelectedChannelId(""); setSuccess("Slack workspace disconnected."); setConfirmDisconnectOpen(false); }
    catch (cause) { setError(message(cause, "Could not disconnect the Slack workspace.")); }
    finally { setIsDisconnecting(false); }
  };

  if (isLoading) return <div className="space-y-4" aria-busy="true"><span className="sr-only">Loading Slack integration…</span><div className={cardSurfaceClasses("muted", "h-16 w-full animate-pulse")} /><div className="h-10 w-full animate-pulse rounded-md bg-muted" /><div className={cardSurfaceClasses("muted", "h-24 w-full animate-pulse")} /></div>;

  if (!status || status.state === "not_connected") return (
    <div className="space-y-6">
      <p className="max-w-[70ch] text-sm text-muted-foreground">Connect your Slack workspace to run event operations and receive selected updates in one event channel.</p>
      <div className={cardSurfaceClasses("muted", "space-y-2 p-4")}><h3 className="text-sm font-medium">What Namos can do</h3><ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground"><li>Read mentions and direct messages sent to Namos</li><li>Post agent replies and event notifications</li><li>List channels so you can choose an event channel</li></ul></div>
      <p className="text-xs text-muted-foreground">Namos does not import channel history or match people by email.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {success && <p role="status" aria-live="polite" className="text-sm text-emerald-700 dark:text-emerald-300">{success}</p>}
      <Button variant="accent" size="sm" disabled={isConnecting} onClick={() => void connect()}><IntegrationBrandIcon provider="slack" size="small" className="h-4 w-4 bg-transparent" />{isConnecting ? "Connecting…" : "Connect Slack"}</Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className={cardSurfaceClasses("muted", "p-4")}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs text-muted-foreground">Workspace</p><p className="font-medium">{status.teamName}</p></div><StatusBadge tone={status.state === "error" || status.lastError ? "destructive" : "success"}>{status.state === "error" || status.lastError ? "Needs attention" : "Connected"}</StatusBadge></div>{bound && <p className="mt-3 text-sm"><span className="text-muted-foreground">Channel</span> · #{status.channelName}{status.isPrivate ? " · Private" : ""}</p>}{status.lastError && <p className="mt-2 text-sm text-destructive">{status.lastError}</p>}</div>
        <div className="space-y-2"><Label htmlFor="slack-channel">Event channel</Label><Select value={selectedChannelId} onValueChange={setSelectedChannelId} onOpenChange={(open) => { if (open && channels.length === 0) void loadChannels(); }}><SelectTrigger id="slack-channel" className="bg-background"><SelectValue placeholder="Choose a channel" /></SelectTrigger><SelectContent>{displayChannels.map((channel) => <SelectItem key={channel.id} value={channel.id} disabled={channel.isPrivate && !channel.isMember}>#{channel.name}{channel.isPrivate ? " · Private" : ""}{channel.isPrivate && !channel.isMember ? " · Invite Namos first" : ""}</SelectItem>)}</SelectContent></Select><Button variant="ghost" size="sm" disabled={isLoadingChannels} onClick={() => void loadChannels()}><RefreshCw className={isLoadingChannels ? "animate-spin" : ""} />Refresh channels</Button>{channelError && <div className="flex flex-wrap items-center gap-2"><p role="alert" className="text-sm text-destructive">{channelError}</p><Button variant="ghost" size="sm" onClick={() => void loadChannels()}>Try again</Button></div>}{!bound && !isLoadingChannels && !channelError && channels.length === 0 && <p className={cardSurfaceClasses("muted", "p-4 text-sm text-muted-foreground")}>No eligible channels found. Invite Namos to a channel, then refresh.</p>}</div>
      </section>

      {(selectedChannelId || bound) && <section className="space-y-3" aria-label="Slack capabilities">
        <div className={cardSurfaceClasses("muted", "flex items-start justify-between gap-4 p-4")}><div className="space-y-1"><Label htmlFor="slack-agent">Operations Agent</Label><p id="slack-agent-description" className="text-sm text-muted-foreground">Use @Namos and /namos ask for this event.</p></div><Switch id="slack-agent" aria-describedby="slack-agent-description" checked={agentEnabled} onCheckedChange={setAgentEnabled} /></div>
        <div className={cardSurfaceClasses("muted", "flex items-start justify-between gap-4 p-4")}><div className="space-y-1"><Label htmlFor="slack-notifications">Event notifications</Label><p id="slack-notifications-description" className="text-sm text-muted-foreground">Post selected event updates to this channel.</p></div><Switch id="slack-notifications" aria-describedby="slack-notifications-description" checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} /></div>
        {notificationsEnabled && <fieldset className={cardSurfaceClasses("muted", "space-y-2 p-4")}><legend className="mb-2 text-sm font-medium">Send these updates</legend>{notificationOptions.map((option) => { const id = `slack-kind-${option.kind}`; return <div key={option.kind} className="flex items-start gap-3 text-sm"><Checkbox id={id} checked={notificationKinds.includes(option.kind)} onCheckedChange={(checked) => setNotificationKinds((current) => checked === true ? [...new Set([...current, option.kind])] : current.filter((kind) => kind !== option.kind))} /><div className="space-y-1"><Label htmlFor={id}>{option.label}</Label><p className="text-xs text-muted-foreground">{option.description}</p></div></div>; })}</fieldset>}
        {invalid && <p className="text-xs text-destructive">Turn on the Operations Agent or at least one notification type.</p>}
      </section>}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {success && <p role="status" aria-live="polite" className="text-sm text-emerald-700 dark:text-emerald-300">{success}</p>}
      <div className="flex flex-wrap items-center gap-2"><Button variant="accent" size="sm" disabled={!selectedChannelId || invalid || isSaving} onClick={() => void save()}>{isSaving ? "Saving…" : bound ? "Save changes" : "Save channel"}</Button>{bound && status.notificationsEnabled && <Button variant="outline" size="sm" disabled={isTesting} onClick={() => void test()}><Send />{isTesting ? "Sending…" : "Send test"}</Button>}{bound && <Button variant="ghost" size="sm" onClick={() => setConfirmRemoveOpen(true)}>Remove from this event</Button>}{status.canDisconnectWorkspace && <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmDisconnectOpen(true)}>Disconnect workspace</Button>}</div>

      <AlertDialog open={confirmRemoveOpen} onOpenChange={setConfirmRemoveOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove Slack from this event?</AlertDialogTitle><AlertDialogDescription>The workspace connection remains available to other events in this organization. This event&apos;s channel, notifications, and agent threads will be removed.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep connection</AlertDialogCancel><AlertDialogAction disabled={isRemoving} onClick={(event) => { event.preventDefault(); void remove(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/85">{isRemoving ? "Removing…" : "Remove channel"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog open={confirmDisconnectOpen} onOpenChange={setConfirmDisconnectOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Disconnect Slack workspace?</AlertDialogTitle><AlertDialogDescription>Slack will stop for every event in this organization. All event bindings, account links, pending deliveries, and agent thread mappings will be removed.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled={isDisconnecting} onClick={(event) => { event.preventDefault(); void disconnect(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/85">{isDisconnecting ? "Disconnecting…" : "Disconnect Slack"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}
