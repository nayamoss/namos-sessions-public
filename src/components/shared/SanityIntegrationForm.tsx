import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRepo } from "@/data/repo";
import type { ContentIntegration, EventId, SanityPublishResult } from "@/data/types";
import { friendlyErrorMessage } from "@/lib/errors";

export function SanityIntegrationForm({ eventId }: { eventId: EventId }) {
  const repo = useRepo();
  const [integration, setIntegration] = useState<ContentIntegration | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectId, setProjectId] = useState("");
  const [dataset, setDataset] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string>();
  const [publishSummary, setPublishSummary] = useState<SanityPublishResult | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const current = await repo.contentIntegrations.status({ eventId, provider: "sanity" });
      setIntegration(current);
    } catch (cause) {
      setError(friendlyErrorMessage(cause, "Could not load the Sanity connection."));
    } finally {
      setLoading(false);
    }
  }, [eventId, repo]);
  useEffect(() => { void load(); }, [load]);

  const connect = async () => {
    setError(undefined);
    setConnecting(true);
    try {
      await repo.contentIntegrations.connectSanity({
        eventId,
        projectId: projectId.trim(),
        dataset: dataset.trim(),
        apiToken: apiToken.trim(),
      });
      setProjectId("");
      setDataset("");
      setApiToken("");
      await load();
    } catch (cause) {
      setError(friendlyErrorMessage(cause, "Could not connect to Sanity."));
    } finally {
      setConnecting(false);
    }
  };

  const publishNow = async () => {
    setError(undefined);
    setPublishSummary(null);
    setPublishing(true);
    try {
      const result = await repo.contentIntegrations.publishSanity({ eventId });
      setPublishSummary(result);
      await load();
    } catch (cause) {
      setError(friendlyErrorMessage(cause, "The Sanity publish failed."));
      await load();
    } finally {
      setPublishing(false);
    }
  };

  const disconnect = async () => {
    setError(undefined);
    setDisconnecting(true);
    try {
      await repo.contentIntegrations.disconnect({ eventId, provider: "sanity" });
      setIntegration(null);
      setPublishSummary(null);
      setConfirmingDisconnect(false);
    } catch (cause) {
      setError(friendlyErrorMessage(cause, "Could not disconnect Sanity."));
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Checking Sanity connection…</p>;

  if (!integration) {
    const disabled = connecting || !projectId.trim() || !dataset.trim() || !apiToken.trim();
    return (
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Create an API token with Editor permissions at manage.sanity.io, and add
          {" "}<code>namosSession</code> / <code>namosSpeaker</code> document types to your
          Sanity schema (see docs) before connecting.
        </p>
        <div className="space-y-2">
          <Label htmlFor="sanity-project-id">Project ID</Label>
          <Input id="sanity-project-id" autoComplete="off" placeholder="abc12345" value={projectId} onChange={(change) => setProjectId(change.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sanity-dataset">Dataset</Label>
          <Input id="sanity-dataset" autoComplete="off" placeholder="production" value={dataset} onChange={(change) => setDataset(change.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sanity-api-token">API Token</Label>
          <Input id="sanity-api-token" type="password" autoComplete="off" value={apiToken} onChange={(change) => setApiToken(change.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="button" variant="accent" disabled={disabled} onClick={() => void connect()}>
          {connecting ? "Connecting…" : "Connect"}
        </Button>
      </div>
    );
  }

  const connectedDataset = integration.config?.sanityDataset ?? "Sanity";
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <StatusBadge tone={integration.status === "error" ? "destructive" : "success"}>
          {integration.status === "error" ? "Error" : "Connected"}
        </StatusBadge>
      </div>
      <p className="text-sm text-muted-foreground">
        Publishing to {connectedDataset}
        {integration.lastSyncedAt
          ? ` · last published ${formatDistanceToNow(integration.lastSyncedAt, { addSuffix: true })}`
          : " · never published"}
      </p>
      {integration.status === "error" && integration.lastError && (
        <p role="alert" className="text-sm text-destructive">{integration.lastError}</p>
      )}
      <Button type="button" variant="accent" disabled={publishing} onClick={() => void publishNow()}>
        {publishing && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
        {publishing ? "Publishing…" : "Publish now"}
      </Button>
      {publishSummary && (
        <div className="space-y-2 text-sm">
          <p>
            {publishSummary.published} published
            {publishSummary.failed > 0 && `, ${publishSummary.failed} failed`}
          </p>
          {publishSummary.failed > 0 && (
            <details>
              <summary className="cursor-pointer text-muted-foreground">View failures</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {publishSummary.failures.map((failure, index) => (
                  <li key={`${failure.name}-${index}`}><span className="font-medium">{failure.name}:</span> {failure.reason}</li>
                ))}
              </ul>
            </details>
          )}
          {publishSummary.hasMore && (
            <p className="text-muted-foreground">More documents remain — click Publish now again.</p>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <p className="text-sm text-muted-foreground">
        Disconnecting stops future publishes — documents already in Sanity are not removed.
      </p>
      {!confirmingDisconnect && (
        <Button type="button" variant="ghost" size="sm" disabled={publishing} onClick={() => setConfirmingDisconnect(true)}>
          Disconnect
        </Button>
      )}
      <AlertDialog open={confirmingDisconnect} onOpenChange={(open) => { if (!open) setConfirmingDisconnect(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Sanity?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the stored token and stops future publishes. Documents already in Sanity are not removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep connection</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/85"
              disabled={disconnecting}
              onClick={(clickEvent) => { clickEvent.preventDefault(); void disconnect(); }}
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
