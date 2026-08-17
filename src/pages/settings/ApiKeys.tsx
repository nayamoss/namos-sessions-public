import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, Copy, KeyRound } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { DetailPane } from "@/components/shared/DetailPane";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRepo } from "@/data/repo";
import type { ApiKey, ApiScope } from "@/data/types";
import { ScopeCheckboxGroup } from "@/components/settings/ScopeCheckboxGroup";
import { ApiAuditLogTable } from "@/components/settings/ApiAuditLogTable";

const dateLabel = (value: number) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(value);

export default function ApiKeys() {
  const repo = useRepo();
  const { event } = useCurrentEvent();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [paneOpen, setPaneOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [rawKey, setRawKey] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revokeKey, setRevokeKey] = useState<ApiKey>();
  const [scopes, setScopes] = useState<ApiScope[]>([]);
  const [attempted, setAttempted] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setKeys(await repo.apiKeys.list({ eventId: event.id })); setError(undefined); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load API keys."); }
    finally { setLoading(false); }
  }, [repo, event.id]);
  useEffect(() => { void load(); }, [load]);

  const closePane = () => { setPaneOpen(false); setLabel(""); setScopes([]); setAttempted(false); setRawKey(undefined); setCopied(false); };
  const generate = async () => {
    setAttempted(true); if (!label.trim()) { setError("Give this key a label."); return; } if (!scopes.length) return;
    setSaving(true);
    try {
      const result = await repo.apiKeys.generate({ eventId: event.id, label, scopes });
      setRawKey(result.rawKey);
      setError(undefined);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not generate the API key."); }
    finally { setSaving(false); }
  };
  const revoke = async () => {
    if (!revokeKey) return;
    setSaving(true);
    try { await repo.apiKeys.revoke({ eventId: event.id, id: revokeKey.id }); setRevokeKey(undefined); setError(undefined); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not revoke the API key."); }
    finally { setSaving(false); }
  };
  const copy = async () => {
    if (!rawKey) return;
    await navigator.clipboard.writeText(rawKey);
    setCopied(true);
  };

  const detail = paneOpen ? (
    <DetailPane title={rawKey ? "Store your key" : "Generate key"} onClose={closePane}>
      {rawKey ? <div className="space-y-4">
        <div className="rounded-lg bg-background p-4"><code className="block select-all break-all font-mono text-sm">{rawKey}</code></div>
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy key"}</Button>
        <p className="text-sm text-muted-foreground">This is the only time you’ll see this key — store it somewhere safe.</p>
        <Button type="button" variant="accent" size="sm" onClick={closePane}>Done</Button>
      </div> : <div className="space-y-4">
        <div className="space-y-2"><Label htmlFor="api-key-label">What’s this token for?</Label><Input id="api-key-label" autoFocus maxLength={80} placeholder="e.g. Website integration" value={label} onChange={(event) => setLabel(event.target.value)} /></div>
        <ScopeCheckboxGroup value={scopes} onChange={setScopes} showValidation={attempted} />
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" size="sm" onClick={closePane}>Cancel</Button><Button type="button" variant="accent" size="sm" disabled={saving || !scopes.length} onClick={() => void generate()}>{saving ? "Generating…" : "Generate"}</Button></div>
      </div>}
    </DetailPane>
  ) : undefined;

  return <AppLayout title="API" detail={detail}><div className="space-y-4">
    <p className="text-base text-muted-foreground">Create scoped tokens for the Namos Sessions API.</p>
    <ContentToolbar ariaLabel="API token actions" primaryAction={(loading || keys.length > 0) ? <Button variant="accent" size="sm" onClick={() => setPaneOpen(true)}><KeyRound />Create token</Button> : undefined} />
    {error && <p role="alert" className="text-sm text-destructive">{error} <button type="button" className="underline underline-offset-4" onClick={() => void load()}>Try again</button></p>}
    {loading ? <div aria-label="Loading API keys" className="space-y-3">{[0, 1, 2].map((row) => <div key={row} className={cardSurfaceClasses("default", "h-16 animate-pulse bg-muted")} />)}</div>
      : keys.length === 0 ? <EmptyState icon={KeyRound} title="No API tokens yet" message="Create a scoped token when an integration is ready." action={<Button variant="accent" size="sm" onClick={() => setPaneOpen(true)}>Create token</Button>} />
      : <div className="space-y-3">{keys.map((key) => <article key={key.id} className={cardSurfaceClasses("default", "bg-muted/60 p-4")}><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><h2 className="font-medium">{key.label}</h2><code className="mt-1 block truncate font-mono text-sm text-muted-foreground">{key.keyPrefix}••••••••</code><div className="mt-2 flex flex-wrap gap-1">{key.scopes.map((scope) => <Badge key={scope} variant="secondary">{scope}</Badge>)}</div><p className="mt-2 text-sm text-muted-foreground">Created {dateLabel(key.createdAt)} · {key.lastUsedAt ? `Last used ${dateLabel(key.lastUsedAt)}` : "Never used"}</p></div><Button type="button" variant="secondary" size="sm" onClick={() => setRevokeKey(key)}>Revoke</Button></div></article>)}</div>}
    <section className={cardSurfaceClasses("default", "bg-muted/60")}><button type="button" className="flex w-full items-center justify-between p-4 text-left font-medium" onClick={() => setAuditOpen((open) => !open)} aria-expanded={auditOpen}>Recent API activity <ChevronDown className={`h-4 w-4 transition-transform ${auditOpen ? "rotate-180" : ""}`} /></button>{auditOpen && <div className="px-4 pb-4"><ApiAuditLogTable eventId={event.id} /></div>}</section>
    <AlertDialog open={Boolean(revokeKey)} onOpenChange={(open) => { if (!open) setRevokeKey(undefined); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Revoke {revokeKey?.label}?</AlertDialogTitle><AlertDialogDescription>This immediately stops the key from working. This can’t be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/85" disabled={saving} onClick={(event) => { event.preventDefault(); void revoke(); }}>{saving ? "Revoking…" : "Revoke"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div></AppLayout>;
}
import { cardSurfaceClasses } from "@/components/ui/card";
