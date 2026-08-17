import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Plug, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/shared/SegmentedControl";
import { cn } from "@/lib/utils";
import { useRepo } from "@/data/repo";
import type { EmailAuthMethod, EmailIntegration, EmailProvider, EventId } from "@/data/types";
import { authMethodLabel, authMethodsByProvider, connectionSummary, credentialFieldsFor, credentialsFor, defaultAuthMethod, emptyCredentialDraft, hasAnyCredential, providerForAuthMethod, providerLabel, requiresRegion, validateDraft, type CredentialDraft } from "@/lib/email-integration-form";
import { friendlyErrorMessage } from "@/lib/errors";
import { cardSurfaceClasses } from "@/components/ui/card";

const credentialFieldLabel: Record<keyof CredentialDraft, string> = { apiKey: "Resend API key", accessKeyId: "AWS access key ID", secretAccessKey: "AWS secret access key", username: "SMTP username", password: "SMTP password" };
const secretFields: (keyof CredentialDraft)[] = ["apiKey", "secretAccessKey", "password"];
const providerBlurb: Record<EmailProvider, string> = { resend: "API key, connect in minutes.", ses: "Bring your own AWS account. API key or SMTP." };

function Segmented<Value extends string>({ label, value, options, onChange }: { label: string; value: Value; options: { value: Value; label: string }[]; onChange: (next: Value) => void }) {
  return <div className="space-y-2"><span className="text-sm font-medium">{label}</span><SegmentedControl label={label} value={value} options={options} onChange={onChange} /></div>;
}

function ProviderPicker({ value, onChange }: { value: EmailProvider; onChange: (next: EmailProvider) => void }) {
  return (
    <div className="space-y-2">
      <span className="text-sm font-medium">Email provider</span>
      <div role="radiogroup" aria-label="Email provider" className="grid gap-3 sm:grid-cols-2">
        {(["resend", "ses"] as EmailProvider[]).map((option) => {
          const selected = value === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option)}
              className={cn(
                "touch-target rounded-lg p-4 text-left transition-colors",
                selected ? "bg-accent" : "bg-muted hover:bg-muted/70",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={cn("font-medium", selected && "text-accent-foreground")}>{providerLabel[option]}</span>
                {selected && <Check className="h-4 w-4 shrink-0 text-accent-foreground" />}
              </div>
              <p className={cn("mt-1 text-sm", selected ? "text-accent-foreground/80" : "text-muted-foreground")}>{providerBlurb[option]}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function EmailIntegrationForm({
  eventId,
  provider: fixedProvider,
}: {
  eventId: EventId;
  provider?: EmailProvider;
}) {
  const repo = useRepo();
  const [integration, setIntegration] = useState<EmailIntegration | null>(null);
  const [loading, setLoading] = useState(true);
  const [authMethod, setAuthMethod] = useState<EmailAuthMethod>("resend_api_key");
  const [sender, setSender] = useState("");
  const [region, setRegion] = useState("");
  const [draft, setDraft] = useState<CredentialDraft>(emptyCredentialDraft);
  const [busy, setBusy] = useState<"save" | "test" | "disconnect" | null>(null);
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const provider = fixedProvider ?? providerForAuthMethod(authMethod);
  const summary = useMemo(() => connectionSummary(integration), [integration]);
  const load = useCallback(async () => { setLoading(true); try { const current = await repo.emailIntegrations.status({ eventId }); setIntegration(current); if (current && (!fixedProvider || current.provider === fixedProvider)) { setAuthMethod(current.authMethod); setSender(current.sender); setRegion(current.region ?? ""); } else if (fixedProvider) { setAuthMethod(defaultAuthMethod(fixedProvider)); setSender(""); setRegion(""); } } catch (cause) { setError(friendlyErrorMessage(cause, "Could not load email delivery settings.")); } finally { setLoading(false); } }, [eventId, fixedProvider, repo]);
  useEffect(() => { void load(); }, [load]);
  const clear = () => { setError(undefined); setSuccess(undefined); };
  const save = async () => { clear(); const invalid = validateDraft({ authMethod, sender, region, draft }); if (invalid) return setError(invalid); setBusy("save"); try { const result = await repo.emailIntegrations.save({ eventId, authMethod, sender: sender.trim(), ...(requiresRegion(authMethod) ? { region: region.trim() } : {}), credentials: credentialsFor(authMethod, draft) }); setDraft(emptyCredentialDraft); setSuccess(`Saved. A test message was delivered to ${result.testRecipient}.`); await load(); } catch (cause) { setError(friendlyErrorMessage(cause, "Could not save these email delivery settings.")); } finally { setBusy(null); } };
  const test = async () => { clear(); if (!integration) { const invalid = validateDraft({ authMethod, sender, region, draft }); return setError(invalid ?? (hasAnyCredential(authMethod, draft) ? "These credentials are not saved yet. Choose Save connection first." : "Enter your provider credentials before testing.")); } setBusy("test"); try { const result = await repo.emailIntegrations.test({ eventId }); setSuccess(`Test message sent to ${result.testRecipient}.`); await load(); } catch (cause) { setError(friendlyErrorMessage(cause, "The test message could not be sent.")); } finally { setBusy(null); } };
  const disconnect = async () => { clear(); setBusy("disconnect"); try { await repo.emailIntegrations.disconnect({ eventId }); setIntegration(null); setDraft(emptyCredentialDraft); setConfirmingDisconnect(false); setSuccess("Email provider disconnected. Event email will not be delivered until a provider is connected again."); } catch (cause) { setError(friendlyErrorMessage(cause, "Could not disconnect the email provider.")); } finally { setBusy(null); } };
  const selectProvider = (next: EmailProvider) => { if (next !== provider) { setAuthMethod(defaultAuthMethod(next)); setDraft(emptyCredentialDraft); clear(); } };
  const selectAuth = (next: EmailAuthMethod) => { if (next !== authMethod) { setAuthMethod(next); setDraft(emptyCredentialDraft); clear(); } };
  if (loading) return <p className="text-sm text-muted-foreground">Checking email connection…</p>;
  return <div className="space-y-6"><section className="space-y-3 rounded-lg bg-background p-6"><div><h2 className="text-base font-semibold">Current connection</h2><p className="mt-1 text-sm text-muted-foreground">{summary}</p></div>{integration && <dl className="grid gap-2 text-sm sm:grid-cols-3"><div><dt className="text-muted-foreground">Sender</dt><dd>{integration.sender}</dd></div><div><dt className="text-muted-foreground">Credential</dt><dd>{integration.credentialHint}</dd></div>{integration.region && <div><dt className="text-muted-foreground">Region</dt><dd>{integration.region}</dd></div>}</dl>}{integration && !confirmingDisconnect && <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => setConfirmingDisconnect(true)}>Disconnect</Button>}{confirmingDisconnect && <div className={cardSurfaceClasses("default", "flex flex-wrap items-center gap-2 bg-muted/60 p-4")}><p className="mr-auto text-sm">Disconnect {providerLabel[integration?.provider ?? provider]}? Stored credentials are deleted.</p><Button type="button" variant="outline" size="sm" onClick={() => setConfirmingDisconnect(false)} disabled={busy !== null}>Keep connection</Button><Button type="button" variant="destructive" size="sm" onClick={() => void disconnect()} disabled={busy !== null}>{busy === "disconnect" ? "Disconnecting…" : "Disconnect"}</Button></div>}</section><section className="space-y-6 rounded-lg bg-background p-6"><div><h2 className="text-base font-semibold">{providerLabel[provider]}</h2><p className="mt-1 text-sm text-muted-foreground">Credentials are encrypted before storage and never returned to this screen.</p>{integration && integration.provider !== provider && <p className="mt-3 text-sm text-muted-foreground">Saving this connection replaces the current {providerLabel[integration.provider]} delivery provider.</p>}</div>{!fixedProvider && <ProviderPicker value={provider} onChange={selectProvider} />}<Segmented label="Authentication method" value={authMethod} options={authMethodsByProvider[provider].filter((value) => value !== "resend_oauth").map((value) => ({ value, label: authMethodLabel[value] }))} onChange={selectAuth} /><div className="grid gap-4 sm:grid-cols-2">{credentialFieldsFor(authMethod).map((field) => <div key={field} className="space-y-2"><Label htmlFor={`email-${field}`}>{credentialFieldLabel[field]}</Label><Input id={`email-${field}`} type={secretFields.includes(field) ? "password" : "text"} autoComplete="off" value={draft[field]} onChange={(change) => setDraft((current) => ({ ...current, [field]: change.target.value }))} /></div>)}{requiresRegion(authMethod) && <div className="space-y-2"><Label htmlFor="email-region">AWS region</Label><Input id="email-region" placeholder="us-east-1" value={region} onChange={(change) => setRegion(change.target.value)} /></div>}</div><div className="space-y-2 sm:max-w-sm"><Label htmlFor="email-sender">Sender address</Label><Input id="email-sender" type="email" placeholder="events@yourdomain.com" value={sender} onChange={(change) => setSender(change.target.value)} /><p className="text-sm text-muted-foreground">Must be a verified sender on the selected provider.</p></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}{success && <p role="status" className="text-sm text-emerald-700">{success}</p>}<div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => void test()} disabled={busy !== null}><Send className="mr-1.5 h-4 w-4" />{busy === "test" ? "Testing…" : "Test connection"}</Button><Button type="button" variant="accent" onClick={() => void save()} disabled={busy !== null}><Plug className="mr-1.5 h-4 w-4" />{busy === "save" ? "Saving…" : "Save connection"}</Button></div></section></div>;
}
