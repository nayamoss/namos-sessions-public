import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { AgentComposer } from "@/components/agent/AgentComposer";
import { AgentHistoryPopover } from "@/components/agent/AgentHistoryPopover";
import { AgentRunInspector } from "@/components/agent/AgentRunInspector";
import { AgentTimeline } from "@/components/agent/AgentTimeline";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { Button } from "@/components/ui/button";
import { useRepo } from "@/data/repo";
import { useRepoQuery } from "@/data/reactive";
import { VOICE_TOGGLE_EVENT } from "@/lib/shortcuts";
import { VoiceChatButton } from "@/components/voice/VoiceChatButton";
import { VoiceSessionPanel } from "@/components/voice/VoiceSessionPanel";
import type { AgentProposalId, AgentRun, AgentRunDetail, AgentRunId } from "@/data/types";

const suggestions = ["Check whether this event is ready to publish", "Find accepted speakers who still need attention", "Review failed communications and overdue tasks"];
const newKey = () => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

export default function AgentOperations() {
  const { event } = useCurrentEvent();
  const repo = useRepo();
  const [params, setParams] = useSearchParams();
  const selectedRunId = params.get("run") as AgentRunId | null;
  const access = useRepoQuery<boolean>("agentRuns.canUse", { eventId: event.id });
  const history = useRepoQuery<AgentRun[]>("agentRuns.list", access.data ? { eventId: event.id, limit: 30 } : "skip");
  const detail = useRepoQuery<AgentRunDetail | null>("agentRuns.get", access.data && selectedRunId ? { eventId: event.id, runId: selectedRunId } : "skip");
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [decisionPendingId, setDecisionPendingId] = useState<AgentProposalId>();
  const [voiceOpen, setVoiceOpen] = useState(false);
  const selected = detail.data;
  const replyMode = selected?.run.status === "needs_input";
  const running = Boolean(selected && !replyMode && ["queued", "running"].includes(selected.run.status));
  const busy = submitting || running;

  useEffect(() => { setError(undefined); setValue(""); }, [selectedRunId]);

  // Alt+V (GlobalKeyboardShortcuts, mounted in AppLayout) fans this event out
  // to every page hosting an agent composer — DashboardHome had voice chat
  // already; this page's full Operations Agent composer did not, even
  // though it's the same agent. Toggle, not always-open, so the same
  // shortcut also closes the panel.
  useEffect(() => {
    const handleToggle = () => { if (!busy) setVoiceOpen((open) => !open); };
    window.addEventListener(VOICE_TOGGLE_EVENT, handleToggle);
    return () => window.removeEventListener(VOICE_TOGGLE_EVENT, handleToggle);
  }, [busy]);

  const submit = async () => {
    setSubmitting(true); setError(undefined);
    try {
      if (replyMode && selected) await repo.agentRuns.respond({ eventId: event.id, runId: selected.run.id, message: value, idempotencyKey: newKey() });
      else { const created = await repo.agentRuns.create({ eventId: event.id, objective: value, idempotencyKey: newKey() }); setParams({ run: created.runId }); }
      setValue("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not submit this run."); } finally { setSubmitting(false); }
  };
  const decide = async (proposalId: AgentProposalId, operation: () => Promise<unknown>) => { setDecisionPendingId(proposalId); setError(undefined); try { await operation(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update this proposal."); } finally { setDecisionPendingId(undefined); } };
  const inspector = selected ? <AgentRunInspector run={selected.run} proposals={selected.proposals} showRunMeta={false} decisionPendingId={decisionPendingId} error={error} onApprove={(proposalId, hash) => decide(proposalId, () => repo.agentRuns.approveTaskProposal({ eventId: event.id, proposalId, expectedPayloadHash: hash })).then(() => undefined)} onReject={(proposalId) => decide(proposalId, () => repo.agentRuns.rejectProposal({ eventId: event.id, proposalId })).then(() => undefined)} onCancel={() => repo.agentRuns.cancel({ eventId: event.id, runId: selected.run.id })} onRetry={() => repo.agentRuns.retry({ eventId: event.id, runId: selected.run.id })} /> : undefined;

  if (access.error?.message.includes("Convex backend")) return <AppLayout title="Operations Agent"><p className="text-sm text-muted-foreground">Operations Agent currently requires the Convex backend.</p></AppLayout>;
  if (!access.isLoading && !access.data) return <AppLayout title="Operations Agent"><div className="space-y-3"><h2 className="text-lg font-semibold">Organizer access required</h2><p className="text-sm text-muted-foreground">Only an event organizer can use the Operations Agent.</p></div></AppLayout>;
  return <AppLayout title="Operations Agent" detail={inspector}><div className="flex min-h-[calc(100vh-10rem)] flex-col gap-4"><ContentToolbar ariaLabel="Agent run controls" utilities={<><AgentHistoryPopover runs={history.data ?? []} selectedRunId={selectedRunId ?? undefined} onSelect={(runId) => setParams({ run: runId })} isLoading={history.isLoading} /><VoiceChatButton eventId={event.id} disabled={busy} onOpen={() => setVoiceOpen(true)} /><Button variant="outline" size="sm" onClick={() => setParams({})}>New run</Button></>} /><div className="min-h-0 flex-1 overflow-y-auto"><AgentTimeline events={selected?.events ?? []} isLoading={Boolean(selectedRunId) && detail.isLoading} />{!selectedRunId && <div className="mt-4 flex flex-wrap justify-center gap-2">{suggestions.map((suggestion) => <Button key={suggestion} variant="outline" size="sm" onClick={() => setValue(suggestion)}><Bot className="h-4 w-4" />{suggestion}</Button>)}</div>}{detail.error && <p role="alert" className="mt-4 text-sm text-destructive">{detail.error.message}</p>}</div><AgentComposer value={value} onChange={setValue} onSubmit={() => void submit()} mode={replyMode ? "reply" : "new"} disabled={busy} error={error} /><p className="sr-only" aria-live="polite">{selected ? `Run status: ${selected.run.status.replace(/_/g, " ")}` : "Ready for a new run"}</p></div>{voiceOpen && <VoiceSessionPanel eventId={event.id} onClose={() => setVoiceOpen(false)} />}</AppLayout>;
}
