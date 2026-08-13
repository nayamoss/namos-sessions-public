import { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { DetailPane } from "@/components/shared/DetailPane";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRepo } from "@/data/repo";
import type { ApiKey } from "@/data/types";

const dateLabel = (value: number) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(value);

export default function ApiKeys() {
  const repo = useRepo();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [paneOpen, setPaneOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [rawKey, setRawKey] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revokeKey, setRevokeKey] = useState<ApiKey>();

  const load = useCallback(async () => {
    setLoading(true);
    try { setKeys(await repo.apiKeys.list()); setError(undefined); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load API keys."); }
    finally { setLoading(false); }
  }, [repo]);
  useEffect(() => { void load(); }, [load]);

  const closePane = () => { setPaneOpen(false); setLabel(""); setRawKey(undefined); setCopied(false); };
  const generate = async () => {
    if (!label.trim()) { setError("Give this key a label."); return; }
    setSaving(true);
    try {
      const result = await repo.apiKeys.generate(label);
      setRawKey(result.rawKey);
      setError(undefined);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not generate the API key."); }
    finally { setSaving(false); }
  };
  const revoke = async () => {
    if (!revokeKey) return;
    setSaving(true);
    try { await repo.apiKeys.revoke(revokeKey.id); setRevokeKey(undefined); setError(undefined); await load(); }
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
        <div className="space-y-2"><Label htmlFor="api-key-label">What’s this key for?</Label><Input id="api-key-label" autoFocus maxLength={80} placeholder="e.g. Website integration" value={label} onChange={(event) => setLabel(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void generate(); }} /></div>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" size="sm" onClick={closePane}>Cancel</Button><Button type="button" variant="accent" size="sm" disabled={saving} onClick={() => void generate()}>{saving ? "Generating…" : "Generate"}</Button></div>
      </div>}
    </DetailPane>
  ) : undefined;

  return <AppLayout title="API" detail={detail}><div className="space-y-4">
    <p className="text-sm text-muted-foreground">Manage keys for the Events API.</p>
    <ContentToolbar ariaLabel="API key actions" primaryAction={(loading || keys.length > 0) ? <Button variant="accent" size="sm" onClick={() => setPaneOpen(true)}><KeyRound />Generate key</Button> : undefined} />
    {error && <p role="alert" className="text-sm text-destructive">{error} <button type="button" className="underline underline-offset-4" onClick={() => void load()}>Try again</button></p>}
    {loading ? <div aria-label="Loading API keys" className="space-y-3">{[0, 1, 2].map((row) => <div key={row} className="h-16 animate-pulse rounded-lg bg-muted" />)}</div>
      : keys.length === 0 ? <section className="flex flex-col items-center rounded-lg bg-muted/60 p-8 text-center"><KeyRound className="h-10 w-10 text-muted-foreground" /><h2 className="mt-4 text-base font-semibold">No API keys yet</h2><p className="mt-1 max-w-md text-sm text-muted-foreground">Generate a key to start pulling your events into another tool.</p><Button className="mt-4" variant="accent" size="sm" onClick={() => setPaneOpen(true)}>Generate key</Button></section>
      : <div className="space-y-3">{keys.map((key) => <article key={key.id} className="rounded-lg bg-muted/60 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><h2 className="font-medium">{key.label}</h2><code className="mt-1 block truncate font-mono text-sm text-muted-foreground">{key.keyPrefix}••••••••</code><p className="mt-2 text-sm text-muted-foreground">Created {dateLabel(key.createdAt)} · {key.lastUsedAt ? `Last used ${dateLabel(key.lastUsedAt)}` : "Never used"}</p></div><Button type="button" variant="secondary" size="sm" onClick={() => setRevokeKey(key)}>Revoke</Button></div></article>)}</div>}
    <AlertDialog open={Boolean(revokeKey)} onOpenChange={(open) => { if (!open) setRevokeKey(undefined); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Revoke {revokeKey?.label}?</AlertDialogTitle><AlertDialogDescription>This immediately stops the key from working. This can’t be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/85" disabled={saving} onClick={(event) => { event.preventDefault(); void revoke(); }}>{saving ? "Revoking…" : "Revoke"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div></AppLayout>;
}
