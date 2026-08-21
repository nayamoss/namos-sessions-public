import { useEffect, useState } from "react";
import { useUser } from "@clerk/clerk-react";
import { ShieldCheck } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { AgentComposer } from "@/components/agent/AgentComposer";
import { AgentHistoryPopover } from "@/components/agent/AgentHistoryPopover";
import { AgentRunInspector } from "@/components/agent/AgentRunInspector";
import { AgentTimeline } from "@/components/agent/AgentTimeline";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCurrentEvent } from "@/components/EventContext";
import { DictationButton } from "@/components/voice/DictationButton";
import { VoiceChatButton } from "@/components/voice/VoiceChatButton";
import { VoiceSessionPanel } from "@/components/voice/VoiceSessionPanel";
import { useDemoSession } from "@/lib/hooks/use-demo-session";
import { useRepo } from "@/data/repo";
import { useRepoQuery } from "@/data/reactive";
import type {
  AgentActionProposal,
  AgentProposalId,
  AgentRun,
  AgentRunDetail,
  AgentRunId,
  AgentSuggestion,
} from "@/data/types";

const newKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

function timeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * The one event-bound Operations Agent surface. Dashboard and the dedicated
 * route deliberately use this exact component so the organizer never has to
 * learn two ways to run or approve an agent review.
 */
export function AgentWorkspace() {
  const { event } = useCurrentEvent();
  const { user } = useUser();
  const firstName = user?.firstName;
  const repo = useRepo();
  const { isDemo } = useDemoSession();
  const [params, setParams] = useSearchParams();
  const selectedRunId = params.get("run") as AgentRunId | null;
  const access = useRepoQuery<boolean>("agentRuns.canUse", { eventId: event.id });
  const history = useRepoQuery<AgentRun[]>(
    "agentRuns.list",
    access.data ? { eventId: event.id, limit: 30 } : "skip",
  );
  const suggestions = useRepoQuery<AgentSuggestion[]>(
    "agentRuns.suggestions",
    access.data ? { eventId: event.id } : "skip",
  );
  const detail = useRepoQuery<AgentRunDetail | null>(
    "agentRuns.get",
    access.data && selectedRunId
      ? { eventId: event.id, runId: selectedRunId }
      : "skip",
  );
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [decisionPendingId, setDecisionPendingId] = useState<AgentProposalId>();
  const [voiceOpen, setVoiceOpen] = useState(false);
  const selected = detail.data;
  const replyMode = selected?.run.status === "needs_input";
  const running = Boolean(
    selected && !replyMode && ["queued", "running"].includes(selected.run.status),
  );
  const busy = submitting || running || isDemo;

  useEffect(() => {
    setError(undefined);
    setValue("");
  }, [selectedRunId]);

  const submit = async () => {
    setSubmitting(true);
    setError(undefined);
    try {
      if (replyMode && selected) {
        await repo.agentRuns.respond({
          eventId: event.id,
          runId: selected.run.id,
          message: value,
          idempotencyKey: newKey(),
        });
      } else {
        const created = await repo.agentRuns.create({
          eventId: event.id,
          objective: value,
          idempotencyKey: newKey(),
        });
        setParams({ run: created.runId });
      }
      setValue("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start this review.");
    } finally {
      setSubmitting(false);
    }
  };
  const decide = async (proposalId: AgentProposalId, operation: () => Promise<unknown>) => {
    setDecisionPendingId(proposalId);
    setError(undefined);
    try {
      await operation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update this proposal.");
    } finally {
      setDecisionPendingId(undefined);
    }
  };
  const approveProposal = async (proposal: AgentActionProposal) => {
    await decide(proposal.id, () =>
      proposal.kind === "create_tasks"
        ? repo.agentRuns.approveTaskProposal({
            eventId: event.id,
            proposalId: proposal.id,
            expectedPayloadHash: proposal.payloadHash,
          })
        : repo.agentRuns.approveMessageProposal({
            eventId: event.id,
            proposalId: proposal.id,
            expectedPayloadHash: proposal.payloadHash,
          }),
    );
  };

  if (access.error?.message.includes("Convex backend")) {
    return <p className="text-sm text-muted-foreground">Operations Agent currently requires the Convex backend.</p>;
  }
  if (!access.isLoading && !access.data) {
    return (
      <section className="space-y-2" aria-labelledby="agent-access-title">
        <h2 id="agent-access-title" className="text-lg font-semibold">Organizer access required</h2>
        <p className="text-sm text-muted-foreground">Only event organizers can use the Operations Agent.</p>
      </section>
    );
  }

  return (
    <Card className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl" aria-label="Operations Agent workspace">
      {isDemo && <div className="flex items-center gap-2 border-b bg-muted/60 px-4 py-3 text-sm"><ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />You're viewing a read-only demo — actions are disabled.</div>}
      <div className="flex shrink-0 items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2" aria-label="Agent controls">
          <AgentHistoryPopover
            runs={history.data ?? []}
            selectedRunId={selectedRunId ?? undefined}
            onSelect={(runId) => setParams({ run: runId })}
            isLoading={history.isLoading}
          />
        </div>
        {selectedRunId && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setParams({})}>
            Clear chat
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-card px-4 py-5 md:px-6 md:py-6">
        <div className="flex min-h-full w-full flex-col">
          {detail.error && <p role="alert" className="text-sm text-destructive">{detail.error.message}</p>}
          {selectedRunId ? (
            <div className="space-y-4 pb-5">
              <AgentTimeline events={selected?.events ?? []} isLoading={detail.isLoading} presentation="run" status={selected?.run.status} />
              {selected && (
                <AgentRunInspector
                  run={selected.run}
                  proposals={selected.proposals}
                  showRunMeta={false}
                  decisionPendingId={decisionPendingId}
                  error={error}
                  readOnly={isDemo}
                  onApprove={approveProposal}
                  onReject={(proposalId) => decide(proposalId, () => repo.agentRuns.rejectProposal({ eventId: event.id, proposalId }))}
                  onCancel={() => repo.agentRuns.cancel({ eventId: event.id, runId: selected.run.id })}
                  onRetry={() => repo.agentRuns.retry({ eventId: event.id, runId: selected.run.id })}
                />
              )}
            </div>
          ) : (
            <div className="flex min-h-full flex-1 flex-col items-center justify-center px-4 py-12 text-center">
              <h2 className="text-2xl font-semibold tracking-tight text-balance">{timeGreeting()}{firstName ? `, ${firstName}` : ""}.</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">How can I help you?</p>
              {suggestions.data && suggestions.data.length > 0 && (
                <div className="mt-6 flex max-w-3xl flex-wrap justify-center gap-2" aria-label="Suggested reviews">
                  {suggestions.data.map((suggestion) => (
                    <Button key={suggestion.id} variant="outline" size="sm" className="h-9 rounded-full px-4" disabled={isDemo} title={isDemo ? "This is a read-only demo." : undefined} onClick={() => setValue(suggestion.objective)}>
                      {suggestion.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <AgentComposer
        value={value}
        onChange={setValue}
        onSubmit={() => void submit()}
        mode={replyMode ? "reply" : "new"}
        disabled={busy}
        readOnly={isDemo}
        error={error}
        controls={<>
          <DictationButton eventId={event.id} disabled={busy} onTranscript={(text) => setValue((current) => (current ? `${current} ${text}` : text))} />
          <VoiceChatButton eventId={event.id} disabled={busy} onOpen={() => setVoiceOpen(true)} />
        </>}
      />
      <p className="sr-only" aria-live="polite">
        {selected ? `Review status: ${selected.run.status.replace(/_/g, " ")}` : "Ready to start a review"}
      </p>
      {voiceOpen && <VoiceSessionPanel eventId={event.id} onClose={() => setVoiceOpen(false)} />}
    </Card>
  );
}
