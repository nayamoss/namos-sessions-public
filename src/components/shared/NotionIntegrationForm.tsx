import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
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
import type {
  ContentIntegration,
  ContentIntegrationTarget,
  EventId,
} from "@/data/types";
import { friendlyErrorMessage } from "@/lib/errors";

const targetLabel: Record<ContentIntegrationTarget, string> = {
  speakers: "Speakers",
  submissions: "Submissions",
};

/**
 * Connect/import/disconnect panel for the Notion content source, rendered inside its `Dialog`
 * on Settings > Integrations. Mirrors `EmailIntegrationForm`'s load/error/success conventions.
 */
export function NotionIntegrationForm({ eventId }: { eventId: EventId }) {
  const repo = useRepo();
  const [integration, setIntegration] = useState<ContentIntegration | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<ContentIntegrationTarget>("speakers");
  const pendingId =
    new URLSearchParams(window.location.search).get("provider") === "notion"
      ? new URLSearchParams(window.location.search).get("content_oauth")
      : null;
  const [databases, setDatabases] = useState<
    Array<{ id: string; title: string }>
  >([]);
  const [databaseId, setDatabaseId] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string>();
  const [importSummary, setImportSummary] = useState<{
    created: number;
    updated: number;
    skipped: number;
    hasMore: boolean;
  } | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const current = await repo.contentIntegrations.status({
        eventId,
        provider: "notion",
      });
      setIntegration(current);
    } catch (cause) {
      setError(
        friendlyErrorMessage(cause, "Could not load the Notion connection."),
      );
    } finally {
      setLoading(false);
    }
  }, [eventId, repo]);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!pendingId || integration) return;
    void repo.contentIntegrations
      .listNotionOAuthDatabases({ eventId, pendingId })
      .then(setDatabases)
      .catch((cause) =>
        setError(
          friendlyErrorMessage(cause, "Could not load your Notion databases."),
        ),
      );
  }, [eventId, integration, pendingId, repo]);

  const connect = async () => {
    setError(undefined);
    setConnecting(true);
    try {
      const result = await repo.contentIntegrations.startOAuth({
        eventId,
        provider: "notion",
        target,
      });
      window.location.assign(result.url);
    } catch (cause) {
      setError(friendlyErrorMessage(cause, "Could not connect to Notion."));
    } finally {
      setConnecting(false);
    }
  };

  const importNow = async () => {
    setError(undefined);
    setImportSummary(null);
    setImporting(true);
    try {
      const result = await repo.contentIntegrations.importNotion({ eventId });
      setImportSummary(result);
      await load();
    } catch (cause) {
      setError(friendlyErrorMessage(cause, "The Notion import failed."));
      await load();
    } finally {
      setImporting(false);
    }
  };

  const disconnect = async () => {
    setError(undefined);
    setDisconnecting(true);
    try {
      await repo.contentIntegrations.disconnect({
        eventId,
        provider: "notion",
      });
      setIntegration(null);
      setImportSummary(null);
      setConfirmingDisconnect(false);
    } catch (cause) {
      setError(friendlyErrorMessage(cause, "Could not disconnect Notion."));
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading)
    return (
      <p className="text-sm text-muted-foreground">
        Checking Notion connection…
      </p>
    );

  if (!integration) {
    const disabled = connecting;
    const finish = async () => {
      if (!pendingId || !databaseId) return;
      setConnecting(true);
      setError(undefined);
      try {
        await repo.contentIntegrations.finishNotionOAuth({
          eventId,
          pendingId,
          databaseId,
        });
        window.history.replaceState({}, "", "/settings/integrations");
        await load();
      } catch (cause) {
        setError(
          friendlyErrorMessage(cause, "Could not save the Notion connection."),
        );
      } finally {
        setConnecting(false);
      }
    };
    return (
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Authorize Namos to access the Notion pages you choose, then select a
          database to import.
        </p>
        <div className="space-y-2">
          <Label htmlFor="notion-target">Import into</Label>
          <Select
            value={target}
            onValueChange={(next: ContentIntegrationTarget) => setTarget(next)}
          >
            <SelectTrigger id="notion-target" aria-label="Import into">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="speakers">Speakers</SelectItem>
              <SelectItem value="submissions">Submissions</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {pendingId ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="notion-database">Database</Label>
              <Select value={databaseId} onValueChange={setDatabaseId}>
                <SelectTrigger id="notion-database">
                  <SelectValue placeholder="Choose a database" />
                </SelectTrigger>
                <SelectContent>
                  {databases.map((database) => (
                    <SelectItem key={database.id} value={database.id}>
                      {database.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="accent"
              disabled={connecting || !databaseId}
              onClick={() => void finish()}
            >
              {connecting ? "Saving…" : "Connect database"}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="accent"
            disabled={disabled}
            onClick={() => void connect()}
          >
            {connecting ? "Redirecting…" : "Connect with Notion"}
          </Button>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <StatusBadge
          tone={integration.status === "error" ? "destructive" : "success"}
        >
          {integration.status === "error" ? "Error" : "Connected"}
        </StatusBadge>
      </div>
      <p className="text-sm text-muted-foreground">
        Importing into {targetLabel[integration.target]}
        {integration.lastSyncedAt
          ? ` · last synced ${formatDistanceToNow(integration.lastSyncedAt, { addSuffix: true })}`
          : " · never synced"}
      </p>
      {integration.status === "error" && integration.lastError && (
        <p role="alert" className="text-sm text-destructive">
          {integration.lastError}
        </p>
      )}
      <Button
        type="button"
        variant="accent"
        disabled={importing}
        onClick={() => void importNow()}
      >
        {importing && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
        {importing ? "Importing…" : "Import now"}
      </Button>
      {importSummary && (
        <p className="text-sm">
          {importSummary.created} created, {importSummary.updated} updated
          {importSummary.skipped > 0 && (
            <span className="text-muted-foreground">
              , {importSummary.skipped} skipped
            </span>
          )}
          {importSummary.hasMore && (
            <span className="block text-muted-foreground">
              More rows remain — click Import now again.
            </span>
          )}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!confirmingDisconnect && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={importing}
          onClick={() => setConfirmingDisconnect(true)}
        >
          Disconnect
        </Button>
      )}
      <AlertDialog
        open={confirmingDisconnect}
        onOpenChange={(open) => {
          if (!open) setConfirmingDisconnect(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Notion?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the stored token. Already-imported speakers or
              submissions are not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep connection</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/85"
              disabled={disconnecting}
              onClick={(clickEvent) => {
                clickEvent.preventDefault();
                void disconnect();
              }}
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
