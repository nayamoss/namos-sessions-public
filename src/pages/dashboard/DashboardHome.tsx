import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlignLeft, ArrowRight, ArrowUp, AudioLines, CalendarDays, ChevronDown, ClipboardList, Layers3, Mail, Mic, PanelRight, PenLine, Plus, Puzzle, Square, Users } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { AgentHistoryPopover } from "@/components/agent/AgentHistoryPopover";
import { AgentTimeline } from "@/components/agent/AgentTimeline";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRepo } from "@/data/repo";
import { cn } from "@/lib/utils";
import { SHORTCUTS, formatShortcut, matchesPrimaryShortcut } from "@/lib/shortcuts";
import { useRepoQuery } from "@/data/reactive";
import type { AgendaItem, AgentRun, AgentRunDetail, AgentRunId, Comm, OnboardingTask, Speaker, Submission } from "@/data/types";
import { projectSpeakerOperationsRows, summarizeSpeakerOperations } from "@/lib/speaker-operations";

const suggestions = ["Check whether this event is ready to publish", "Find accepted speakers who still need attention", "Review failed communications and overdue tasks"];
// Shared empty fallback: a fresh `[]` per render would give every dependent
// useMemo a new identity each pass and recompute the whole dashboard.
const EMPTY: readonly unknown[] = [];

// Hover surface for an interactive row. Split out of the geometry classes the
// way AppLayout composes its nav links: the resting row has no fill of its own,
// so the hover fill is a state, not a card surface.
const RAIL_ROW = cn("flex items-center rounded-lg p-2 transition-colors", "hover:bg-muted");
const RAIL_STORAGE_KEY = "namos-dashboard-right-collapsed";
const newKey = () => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// Ported from Imori's composer (components/AgentChat.tsx). "Depth" is the
// concise→deep axis: Deep means more reasoning, not just more words.
const DEPTH_OPTIONS = [
  { value: "concise", label: "Concise", hint: "Short, direct. 1–3 sentences max." },
  { value: "balanced", label: "Balanced", hint: "Answers fully without padding." },
  { value: "chatty", label: "Chatty", hint: "Warm, conversational." },
  { value: "deep", label: "Deep", hint: "Thorough with context and examples." },
] as const;

type Depth = (typeof DEPTH_OPTIONS)[number]["value"];

function DepthSelect({ value, onChange }: { value: Depth; onChange: (value: Depth) => void }) {
  const active = DEPTH_OPTIONS.find((option) => option.value === value) ?? DEPTH_OPTIONS[0];
  return (
    <Select value={value} onValueChange={(next) => onChange(next as Depth)}>
      {/* Not <SelectValue /> — that clones the item's children into the trigger,
          hint included. The trigger shows the one word; hints live in the menu. */}
      <SelectTrigger
        className="h-8 w-auto gap-1 bg-transparent px-2 text-[13px] font-medium text-muted-foreground shadow-none hover:bg-muted hover:text-foreground focus:ring-0"
        aria-label={`Depth: ${active.label}`}
      >
        <AlignLeft className="h-3.5 w-3.5" />
        {active.label}
      </SelectTrigger>
      <SelectContent align="start">
        <SelectGroup>
          <SelectLabel>Depth</SelectLabel>
          {DEPTH_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <span className="font-medium">{option.label}</span>
              <span className="ml-2 text-xs text-muted-foreground">{option.hint}</span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

// Each rail section collapses independently and remembers its state, so the
// rail can be pared down to just the sections you actually use.
function RailSection({ title, storageKey, children }: { title: string; storageKey: string; children: ReactNode }) {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(storageKey) !== "false"; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem(storageKey, String(open)); } catch { /* rail still works without storage */ }
  }, [open, storageKey]);

  return (
    <Card className="overflow-hidden rounded-xl">
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors", "hover:bg-muted")}
        >
          <span className="text-sm font-medium text-foreground">{title}</span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", !open && "-rotate-90")} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="px-2 pb-2 pt-1">{children}</div>
      </CollapsibleContent>
    </Collapsible>
    </Card>
  );
}

// Imori's composer row carries writing-product controls (sources, skills, voice
// guide, dictation, voice chat) that have no equivalent in this app yet. They
// are rendered here as inert placeholders so the row matches Imori visually;
// each is disabled and announces itself as unavailable rather than pretending
// to work. Wire them up as the underlying features land.
function ComposerStub({ icon: Icon, label }: { icon: typeof Puzzle; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          disabled
          aria-label={`${label} (not available yet)`}
          className="compact-hit-target inline-flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-lg text-muted-foreground opacity-40"
        >
          <Icon className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent><p className="text-xs">{label} — not available yet</p></TooltipContent>
    </Tooltip>
  );
}

export default function DashboardHome() {
  const repo = useRepo();
  const { event } = useCurrentEvent();
  const [params, setParams] = useSearchParams();
  const selectedRunId = params.get("run") as AgentRunId | null;
  const access = useRepoQuery<boolean>("agentRuns.canUse", { eventId: event.id });
  const history = useRepoQuery<AgentRun[]>("agentRuns.list", access.data ? { eventId: event.id, limit: 30 } : "skip");
  const detail = useRepoQuery<AgentRunDetail | null>("agentRuns.get", access.data && selectedRunId ? { eventId: event.id, runId: selectedRunId } : "skip");
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const selected = detail.data;
  const replyMode = selected?.run.status === "needs_input";
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [depth, setDepth] = useState<Depth>("balanced");
  const running = Boolean(selected && ["queued", "running"].includes(selected.run.status));
  const busy = submitting || (running && !replyMode);

  useEffect(() => { setError(undefined); setValue(""); }, [selectedRunId]);

  // Right rail: collapsible, remembered, and auto-collapsed on tablet widths.
  // A matchMedia listener rather than a one-time width check, so resizing or
  // rotating after load still collapses instead of leaving the rail stuck open.
  const [railCollapsed, setRailCollapsed] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1024px)");
    const apply = (isTablet: boolean) => setRailCollapsed(isTablet ? true : localStorage.getItem(RAIL_STORAGE_KEY) === "true");
    apply(query.matches);
    const onChange = (e: MediaQueryListEvent) => apply(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  useEffect(() => { localStorage.setItem(RAIL_STORAGE_KEY, String(railCollapsed)); }, [railCollapsed]);

  // Owned here rather than in GlobalKeyboardShortcuts because the rail is this
  // page's state — the same way DesktopSidebar owns its own toggle. Deliberately
  // not gated on isKeyboardShortcutBlocked: toggling chrome should still work
  // while the composer has focus.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!matchesPrimaryShortcut(e, SHORTCUTS.rightPanel)) return;
      e.preventDefault();
      setRailCollapsed((prev) => !prev);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const submit = async () => {
    setSubmitting(true); setError(undefined);
    try {
      if (replyMode && selected) await repo.agentRuns.respond({ eventId: event.id, runId: selected.run.id, message: value, idempotencyKey: newKey() });
      else { const created = await repo.agentRuns.create({ eventId: event.id, objective: value, idempotencyKey: newKey() }); setParams({ run: created.runId }); }
      setValue("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not submit this run."); } finally { setSubmitting(false); }
  };

  const submissions = useRepoQuery<Submission[]>("submissions.list", { eventId: event.id }).data ?? (EMPTY as unknown as Submission[]);
  const agenda = useRepoQuery<AgendaItem[]>("agenda.list", { eventId: event.id }).data ?? (EMPTY as unknown as AgendaItem[]);
  const speakers = useRepoQuery<Speaker[]>("speakers.list", { eventId: event.id }).data ?? (EMPTY as unknown as Speaker[]);
  const tasks = useRepoQuery<OnboardingTask[]>("tasks.list", { eventId: event.id }).data ?? (EMPTY as unknown as OnboardingTask[]);
  const comms = useRepoQuery<Comm[]>("comms.list", { eventId: event.id }).data ?? (EMPTY as unknown as Comm[]);

  const speakerSummary = useMemo(() => summarizeSpeakerOperations(projectSpeakerOperationsRows({ speakers, submissions, tasks, comms, now: Date.now() })), [comms, speakers, submissions, tasks]);
  const unscheduledAccepted = useMemo(() => {
    const scheduledSubmissionIds = new Set(agenda.flatMap((item) => item.submissionId ? [item.submissionId] : []));
    return submissions.filter((submission) => submission.status === "accepted" && !scheduledSubmissionIds.has(submission.id)).length;
  }, [agenda, submissions]);
  const awaitingDecision = submissions.filter((submission) => ["pending", "accept_queue", "decline_queue"].includes(submission.status)).length;

  const actionItems = [
    awaitingDecision > 0 ? { icon: ClipboardList, label: `${awaitingDecision} awaiting decision`, detail: "Review abstracts", to: `/events/${event.slug}/program/abstracts` } : null,
    unscheduledAccepted > 0 ? { icon: CalendarDays, label: `${unscheduledAccepted} need a time slot`, detail: "Schedule on the agenda", to: `/events/${event.slug}/program/agenda` } : null,
    speakerSummary.needsAttention > 0 ? { icon: Users, label: `${speakerSummary.needsAttention} need onboarding`, detail: "Review speakers", to: `/events/${event.slug}/program/speakers?view=needs-attention` } : null,
  ].filter((item): item is { icon: typeof ClipboardList; label: string; detail: string; to: string } => item !== null);

  const quickAccess = [
    { icon: ClipboardList, label: "Abstracts", to: `/events/${event.slug}/program/abstracts` },
    { icon: Users, label: "Speakers", to: `/events/${event.slug}/program/speakers` },
    { icon: CalendarDays, label: "Agenda", to: `/events/${event.slug}/program/agenda` },
    { icon: Mail, label: "Communications", to: `/events/${event.slug}/program/communications` },
  ];

  if (access.error?.message.includes("Convex backend")) return <AppLayout title="Dashboard"><p className="text-sm text-muted-foreground">Dashboard currently requires the Convex backend.</p></AppLayout>;

  return <AppLayout title="Dashboard"><div className="h-full min-h-0 flex flex-col gap-1.5 overflow-hidden">
    <div className="min-h-0 flex-1 flex gap-2 overflow-hidden">

      {/* Center: agent chat — the page's card surface, on the page background.
          AppLayout no longer paints one behind it (#171). */}
      <Card className="flex-1 min-w-0 flex flex-col overflow-hidden rounded-xl">
        <div className="shrink-0 flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-1">
            <AgentHistoryPopover runs={history.data ?? []} selectedRunId={selectedRunId ?? undefined} onSelect={(runId) => setParams({ run: runId })} isLoading={history.isLoading} />
            <button
              type="button"
              onClick={() => setParams({})}
              className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-muted-foreground transition-colors", "hover:bg-muted hover:text-foreground")}
              title="New chat"
            >
              <Plus className="h-3.5 w-3.5" />
              New
            </button>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setRailCollapsed((prev) => !prev)}
                aria-label={railCollapsed ? "Show quick access" : "Hide quick access"}
                aria-pressed={!railCollapsed}
                className={cn("compact-hit-target inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors", "hover:bg-muted hover:text-foreground")}
              >
                <PanelRight className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">{railCollapsed ? "Show" : "Hide"} quick access · {formatShortcut(SHORTCUTS.rightPanel).join("")}</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {selectedRunId ? (
            <AgentTimeline events={selected?.events ?? []} isLoading={detail.isLoading} />
          ) : (
            <div className="flex h-full min-h-full flex-col items-center justify-center gap-6 px-0 py-4 text-center">
              <div className="space-y-1.5">
                <h2 className="text-xl font-semibold tracking-normal text-foreground">{greeting()}</h2>
                <p className="text-base text-muted-foreground">What should we work on?</p>
              </div>
              {access.data && (
                <div className="flex flex-wrap justify-center gap-2">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setValue(suggestion)}
                      className={cn("group rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors", "bg-muted/40 hover:bg-muted hover:text-foreground")}
                    >
                      <span className="font-medium text-foreground/80 group-hover:text-foreground">{suggestion}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {access.data && (
          <div className="p-3">
            <form onSubmit={(e) => { e.preventDefault(); if (!busy && value.trim()) void submit(); }} className="mx-auto w-full">
              {/* The field is defined by background contrast, not a border. The
                  focus-within intensifier lives on the inner wrapper so the
                  surface itself stays a plain Card. */}
              <Card variant="muted" className="overflow-hidden rounded-xl">
                <div className="transition-colors focus-within:bg-muted">
                <div className="px-4 pb-2 pt-3.5">
                  <Textarea
                    ref={textareaRef}
                    value={value}
                    onChange={(e) => { setValue(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`; }}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!busy && value.trim()) void submit(); } }}
                    placeholder={replyMode ? "Answer the agent's question" : "Ask anything..."}
                    rows={1}
                    disabled={busy}
                    className="min-h-[28px] max-h-[160px] resize-none rounded-none bg-transparent px-0 py-0 leading-6 placeholder:text-muted-foreground/45 focus-visible:bg-transparent"
                  />
                </div>
                {/* One row, inside the field: sources → skills → voice → depth on
                    the left; how you talk to it plus send on the right. */}
                <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5">
                  <div className="flex min-w-0 items-center gap-1">
                    <ComposerStub icon={Layers3} label="Sources" />
                    <ComposerStub icon={Puzzle} label="Skills" />
                    <ComposerStub icon={PenLine} label="Voice guide" />
                    <DepthSelect value={depth} onChange={setDepth} />
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <ComposerStub icon={Mic} label="Dictation" />
                    <ComposerStub icon={AudioLines} label="Voice chat" />
                    {running ? (
                      <button
                        type="button"
                        onClick={() => { if (selected) void repo.agentRuns.cancel({ eventId: event.id, runId: selected.run.id }); }}
                        className="compact-hit-target ml-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background transition-opacity"
                        aria-label="Stop"
                        title="Stop"
                      >
                        <Square className="h-3 w-3 fill-current" />
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={busy || !value.trim()}
                        className="compact-hit-target ml-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-25"
                        aria-label="Send"
                        title="Send"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                </div>
              </Card>
              {error && <p role="alert" className="mt-1 px-1 text-xs text-destructive">{error}</p>}
            </form>
          </div>
        )}
      </Card>

      {/* Right: compact action rail. Toggle lives in the chat top bar, so this
          hides fully instead of leaving a floating icon column behind. */}
      {!railCollapsed && (
      <div className="w-72 shrink-0 h-full min-h-0 overflow-y-auto px-1 py-1 space-y-1.5">
        <RailSection title="Quick access" storageKey="namos-dashboard-rail-quick-access">
          <div className="grid grid-cols-2 gap-1">
            {quickAccess.map(({ icon: Icon, label, to }) => (
              <Link key={to} to={to} className={cn(RAIL_ROW, "gap-1.5 text-xs")}>
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{label}</span>
              </Link>
            ))}
          </div>
        </RailSection>

        {actionItems.length > 0 && (
          <RailSection title="Action items" storageKey="namos-dashboard-rail-action-items">
            <div className="space-y-0.5">
              {actionItems.map((item) => (
                <Link key={item.to} to={item.to} className={cn(RAIL_ROW, "gap-2")}>
                  <item.icon className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium">{item.label}</p>
                    <p className="text-[10px] text-muted-foreground">{item.detail}</p>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </RailSection>
        )}
      </div>
      )}
    </div>
  </div></AppLayout>;
}
