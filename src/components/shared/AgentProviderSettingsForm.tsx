import { useCallback, useEffect, useState } from "react";
import { Bot, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/shared/SegmentedControl";
import { useRepo } from "@/data/repo";
import type { AgentProviderMode, AgentProviderSetting, EventId } from "@/data/types";
import { friendlyErrorMessage } from "@/lib/errors";

const options: { value: AgentProviderMode; label: string }[] = [
  { value: "managed", label: "Namos managed" },
  { value: "bring_your_own", label: "Bring your own key" },
];

export function AgentProviderSettingsForm({ eventId, onSaved }: { eventId: EventId; onSaved?: () => void }) {
  const repo = useRepo();
  const [setting, setSetting] = useState<AgentProviderSetting>();
  const [mode, setMode] = useState<AgentProviderMode>("managed");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const load = useCallback(async () => {
    setLoading(true);
    try { const current = await repo.agentProviderSettings.status({ eventId }); setSetting(current); setMode(current.mode); }
    catch (cause) { setError(friendlyErrorMessage(cause, "Could not load AI provider settings.")); }
    finally { setLoading(false); }
  }, [eventId, repo]);
  useEffect(() => { void load(); }, [load]);
  const save = async () => {
    setError(undefined); setSuccess(undefined);
    if (mode === "bring_your_own" && apiKey.trim().length < 20) return setError("Enter a valid OpenAI API key.");
    setBusy(true);
    try {
      if (mode === "managed") await repo.agentProviderSettings.saveManaged({ eventId });
      else await repo.agentProviderSettings.saveByok({ eventId, apiKey: apiKey.trim() });
      setApiKey("");
      setSuccess(mode === "managed" ? "Namos-managed AI is active for new runs." : "Your OpenAI key was verified, encrypted, and connected.");
      await load(); onSaved?.();
    } catch (cause) { setError(friendlyErrorMessage(cause, "Could not save AI provider settings.")); }
    finally { setBusy(false); }
  };
  if (loading) return <p className="text-sm text-muted-foreground">Checking AI provider…</p>;
  return <div className="space-y-6">
    <section className="space-y-3 rounded-lg bg-background p-6">
      <div><h2 className="text-base font-semibold">Current provider</h2><p className="mt-1 text-sm text-muted-foreground">{setting?.mode === "bring_your_own" ? "Organizer-provided OpenAI key" : "Namos-managed OpenAI"}</p></div>
      <dl className="grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Status</dt><dd>{setting?.status === "ready" ? "Ready" : "Needs attention"}</dd></div>{setting?.credentialHint && <div><dt className="text-muted-foreground">Credential</dt><dd>{setting.credentialHint}</dd></div>}</dl>
    </section>
    <section className="space-y-5 rounded-lg bg-background p-6">
      <div><h2 className="text-base font-semibold">Who provides the model key?</h2><p className="mt-1 text-sm text-muted-foreground">This choice applies to new Operations Agent runs for this event. Existing runs keep the mode they started with.</p></div>
      <SegmentedControl label="AI provider billing mode" value={mode} options={options} onChange={(value) => { setMode(value); setError(undefined); setSuccess(undefined); }} />
      {mode === "managed" ? <div className={cardSurfaceClasses("default", "flex gap-3 bg-muted/60 p-4")}><Bot className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" /><div><p className="text-sm font-medium">Use Namos-managed AI</p><p className="mt-1 text-sm text-muted-foreground">No API key is needed. Token usage is recorded to this event for billing under your Namos plan.</p>{setting && !setting.managedAvailable && <p className="mt-2 text-sm text-destructive">Managed AI is not configured on this deployment.</p>}</div></div> : <div className="space-y-3"><div className={cardSurfaceClasses("default", "flex gap-3 bg-muted/60 p-4")}><KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" /><div><p className="text-sm font-medium">Use your OpenAI account</p><p className="mt-1 text-sm text-muted-foreground">OpenAI bills your account directly. Namos verifies the key once, encrypts it at rest, and never returns it to the browser.</p></div></div><div className="space-y-2 sm:max-w-lg"><Label htmlFor="agent-openai-key">OpenAI API key</Label><Input id="agent-openai-key" type="password" autoComplete="off" placeholder={setting?.mode === "bring_your_own" ? "Enter a new key to replace the saved key" : "sk-…"} value={apiKey} onChange={(event) => setApiKey(event.target.value)} /><p className="text-sm text-muted-foreground">Saving replaces any previously stored organizer key for this event.</p></div></div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{success && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{success}</p>}
      <Button type="button" variant="accent" onClick={() => void save()} disabled={busy || (mode === "managed" && setting && !setting.managedAvailable)}>{busy ? "Saving…" : "Save AI provider"}</Button>
    </section>
  </div>;
}
import { cardSurfaceClasses } from "@/components/ui/card";
