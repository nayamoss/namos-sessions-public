import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRepo } from "@/data/repo";
import type { ContentIntegration, ContentIntegrationTarget, EventId } from "@/data/types";
import { friendlyErrorMessage } from "@/lib/errors";

const targetLabel: Record<ContentIntegrationTarget, string> = { speakers: "Speakers", submissions: "Submissions" };

/**
 * Connect/import/disconnect panel for the Notion content source, rendered inside its `Dialog`
 * on Settings > Integrations. Mirrors `EmailIntegrationForm`'s load/error/success conventions.
 */
export function NotionIntegrationForm({ eventId }: { eventId: EventId }) {
  const repo = useRepo();
  const [integration, setIntegration] = useState<ContentIntegration | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [databaseId, setDatabaseId] = useState("");
  const [target, setTarget] = useState<ContentIntegrationTarget>("speakers");
  const [connecting, setConnecting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string>();
  const [importSummary, setImportSummary] = useState<{ created: number; updated: number; skipped: number; hasMore: boolean } | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const current = await repo.contentIntegrations.status({ eventId, provider: "notion" });
      setIntegration(current);
    } catch (cause) {
      setError(friendlyErrorMessage(cause, "Could not load the Notion connection."));
    } finally {
      setLoading(false);
    }
  }, [eventId, repo]);
  useEffect(() => { void load(); }, [load]);

  const connect = async () => {
    setError(undefined);
    setConnecting(true);
    try {
      await repo.contentIntegrations.connectNotion({ eventId, notionToken: token.trim(), notionDatabaseId: databaseId.trim(), target });
      setToken("");
      setDatabaseId("");
      await load();
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
      await repo.contentIntegrations.disconnect({ eventId, provider: "notion" });
      setIntegration(null);
      setImportSummary(null);
      setConfirmingDisconnect(false);
    } catch (cause) {
      setError(friendlyErrorMessage(cause, "Could not disconnect Notion."));
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Checking Notion connection…</p>;

  if (!integration) {
    const disabled = connecting || !token.trim() || !databaseId.trim();
    return (
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Create a Notion internal integration at notion.so/my-integrations, share your
          database with it, then paste the token and database ID below.
        </p>
        <div className="space-y-2">
          <Label htmlFor="notion-token">Internal Integration Token</Label>
          <Input id="notion-token" type="password" autoComplete="off" placeholder="secret_..." value={token} onChange={(change) => setToken(change.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="notion-database-id">Database ID</Label>
          <Input id="notion-database-id" autoComplete="off" placeholder="32-character Notion database ID" value={databaseId} onChange={(change) => setDatabaseId(change.target.value)} />
          <p className="text-sm text-muted-foreground">Copy from the database URL — the 32-character segment before <code>?v=</code>.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="notion-target">Import into</Label>
          <Select value={target} onValueChange={(next: ContentIntegrationTarget) => setTarget(next)}>
            <SelectTrigger id="notion-target" aria-label="Import into"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="speakers">Speakers</SelectItem>
              <SelectItem value="submissions">Submissions</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="button" variant="accent" disabled={disabled} onClick={() => void connect()}>
          {connecting ? "Connecting…" : "Connect"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <StatusBadge tone={integration.status === "error" ? "destructive" : "success"}>
          {integration.status === "error" ? "Error" : "Connected"}
        </StatusBadge>
      </div>
      <p className="text-sm text-muted-foreground">
        Importing into {targetLabel[integration.target]}
        {integration.lastSyncedAt ? ` · last synced ${formatDistanceToNow(integration.lastSyncedAt, { addSuffix: true })}` : " · never synced"}
      </p>
      {integration.status === "error" && integration.lastError && (
        <p role="alert" className="text-sm text-destructive">{integration.lastError}</p>
      )}
      <Button type="button" variant="accent" disabled={importing} onClick={() => void importNow()}>
        {importing && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
        {importing ? "Importing…" : "Import now"}
      </Button>
      {importSummary && (
        <p className="text-sm">
          {importSummary.created} created, {importSummary.updated} updated
          {importSummary.skipped > 0 && <span className="text-muted-foreground">, {importSummary.skipped} skipped</span>}
          {importSummary.hasMore && <span className="block text-muted-foreground">More rows remain — click Import now again.</span>}
        </p>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!confirmingDisconnect && (
        <Button type="button" variant="ghost" size="sm" disabled={importing} onClick={() => setConfirmingDisconnect(true)}>
          Disconnect
        </Button>
      )}
      <AlertDialog open={confirmingDisconnect} onOpenChange={(open) => { if (!open) setConfirmingDisconnect(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Notion?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the stored token. Already-imported speakers or submissions are not deleted.
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
