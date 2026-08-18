import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlignLeft, ArrowRight, ArrowUp, CalendarDays, ChevronDown, ClipboardCheck, ClipboardList, Layers3, Loader2, Mail, Megaphone, Mic, PanelRight, PenLine, Puzzle, Square, UserRoundX, Users } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { AgentHistoryPopover } from "@/components/agent/AgentHistoryPopover";
import { AgentTimeline } from "@/components/agent/AgentTimeline";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRepo } from "@/data/repo";
import { cn } from "@/lib/utils";
import { SHORTCUTS, VOICE_TOGGLE_EVENT, formatShortcut, matchesPrimaryShortcut } from "@/lib/shortcuts";
import { useRepoQuery } from "@/data/reactive";
import { useDictation } from "@/lib/voice/use-dictation";
import { VoiceChatButton } from "@/components/voice/VoiceChatButton";
import { VoiceSessionPanel } from "@/components/voice/VoiceSessionPanel";
import type { AgendaItem, AgentRun, AgentRunDetail, AgentRunId, Comm, OnboardingTask, Speaker, Submission, SubmissionForm } from "@/data/types";
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
type SidebarTab = "action-items" | "voice-agent";
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

// These writing-product controls have no equivalent in this app yet. Keep their
// unavailable state honest while dictation and voice chat are wired separately.
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
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("action-items");
  const selected = detail.data;
  const replyMode = selected?.run.status === "needs_input";
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [depth, setDepth] = useState<Depth>("balanced");
  const running = Boolean(selected && ["queued", "running"].includes(selected.run.status));
  const busy = submitting || (running && !replyMode);
  const dictation = useDictation({
    eventId: event.id,
    onTranscript: (text) => setValue((current) => `${current}${current && text ? " " : ""}${text}`),
    onError: (message) => setError(message),
  });

  useEffect(() => { setError(undefined); setValue(""); }, [selectedRunId]);

  // Right rail: collapsible, remembered, and auto-collapsed on tablet widths.
  // A matchMedia listener rather than a one-time width check, so resizing or
  // rotating after load still collapses instead of leaving the rail stuck open.
  const [railCollapsed, setRailCollapsed] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1024px)");
    const storedPreference = () => {
      try {
        const stored = localStorage.getItem(RAIL_STORAGE_KEY);
        return stored === "true" ? true : stored === "false" ? false : false;
      } catch { return false; }
    };
    const apply = (isTablet: boolean) => setRailCollapsed(isTablet ? true : storedPreference());
    apply(query.matches);
    const onChange = (e: MediaQueryListEvent) => apply(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  useEffect(() => { try { localStorage.setItem(RAIL_STORAGE_KEY, String(railCollapsed)); } catch { /* preference is optional */ } }, [railCollapsed]);

  const closeSidebar = () => {
    setRailCollapsed(true);
    setVoiceOpen(false);
  };
  const toggleActionItems = () => {
    if (railCollapsed) {
      setSidebarTab("action-items");
      setRailCollapsed(false);
    } else if (sidebarTab === "action-items") {
      closeSidebar();
    } else {
      setSidebarTab("action-items");
    }
  };
  const toggleVoiceAgent = () => {
    if (busy) return;
    if (railCollapsed) {
      setSidebarTab("voice-agent");
      setVoiceOpen(true);
      setRailCollapsed(false);
    } else if (sidebarTab === "voice-agent") {
      closeSidebar();
    } else {
      setSidebarTab("voice-agent");
      setVoiceOpen(true);
    }
  };

  // Alt+V (GlobalKeyboardShortcuts, mounted in AppLayout) fans this event out
  // to every page hosting a composer. It cooperates with the rail shortcut:
  // switching away from voice keeps its mounted session alive, while closing
  // the sidebar tears that session down just as the old standalone panel did.
  useEffect(() => {
    window.addEventListener(VOICE_TOGGLE_EVENT, toggleVoiceAgent);
    return () => window.removeEventListener(VOICE_TOGGLE_EVENT, toggleVoiceAgent);
  }, [busy, railCollapsed, sidebarTab]);

  // Owned here rather than in GlobalKeyboardShortcuts because the rail is this
  // page's state — the same way DesktopSidebar owns its own toggle. Deliberately
  // not gated on isKeyboardShortcutBlocked: toggling chrome should still work
  // while the composer has focus.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!matchesPrimaryShortcut(e, SHORTCUTS.rightPanel)) return;
      e.preventDefault();
      toggleActionItems();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [railCollapsed, sidebarTab]);

  const submit = async () => {
    setSubmitting(true); setError(undefined);
    try {
      if (replyMode && selected) await repo.agentRuns.respond({ eventId: event.id, runId: selected.run.id, message: value, idempotencyKey: newKey() });
      else { const created = await repo.agentRuns.create({ eventId: event.id, objective: value, idempotencyKey: newKey() }); setParams({ run: created.runId }); }
      setValue("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not submit this run."); } finally { setSubmitting(false); }
  };

  // `.data` is `undefined` until a query resolves, which is not the same thing
  // as "this event has nothing". Collapsing both into `[]` is what made an event
  // with 529 submissions render "No submissions yet" and drop the whole dashboard
  // into the first-run CFP setup rail whenever a subscription was slow to land.
  // The empty arrays stay — every derived count below depends on them — but the
  // loading flag is kept alongside so the copy can say "not yet known" instead of
  // asserting zero.
  const submissionsQuery = useRepoQuery<Submission[]>("submissions.list", { eventId: event.id });
  const agendaQuery = useRepoQuery<AgendaItem[]>("agenda.list", { eventId: event.id });
  const speakersQuery = useRepoQuery<Speaker[]>("speakers.list", { eventId: event.id });
  const tasksQuery = useRepoQuery<OnboardingTask[]>("tasks.list", { eventId: event.id });
  const commsQuery = useRepoQuery<Comm[]>("comms.list", { eventId: event.id });
  const formsQuery = useRepoQuery<SubmissionForm[]>("forms.list", { eventId: event.id });
  const submissions = submissionsQuery.data ?? (EMPTY as unknown as Submission[]);
  const agenda = agendaQuery.data ?? (EMPTY as unknown as AgendaItem[]);
  const speakers = speakersQuery.data ?? (EMPTY as unknown as Speaker[]);
  const tasks = tasksQuery.data ?? (EMPTY as unknown as OnboardingTask[]);
  const comms = commsQuery.data ?? (EMPTY as unknown as Comm[]);
  const forms = formsQuery.data ?? (EMPTY as unknown as SubmissionForm[]);
  const cfpCount = forms.length;
  // Any unresolved query means the numbers on screen are provisional.
  const dataPending = submissionsQuery.data === undefined
    || agendaQuery.data === undefined
    || speakersQuery.data === undefined
    || tasksQuery.data === undefined
    || commsQuery.data === undefined
    || formsQuery.data === undefined;

  const speakerSummary = useMemo(() => summarizeSpeakerOperations(projectSpeakerOperationsRows({ speakers, submissions, tasks, comms, now: Date.now() })), [comms, speakers, submissions, tasks]);
  const unscheduledAccepted = useMemo(() => {
    const scheduledSubmissionIds = new Set(agenda.flatMap((item) => item.submissionId ? [item.submissionId] : []));
    return submissions.filter((submission) => submission.status === "accepted" && !scheduledSubmissionIds.has(submission.id)).length;
  }, [agenda, submissions]);
  const awaitingDecision = submissions.filter((submission) => ["pending", "accept_queue", "maybe", "decline_queue"].includes(submission.status)).length;

  const openTasks = tasks.filter((task) => task.status !== "completed");
  const latestTask = [...openTasks].sort((left, right) => (left.dueDate ?? Number.MAX_SAFE_INTEGER) - (right.dueDate ?? Number.MAX_SAFE_INTEGER))[0];
  const latestSubmission = [...submissions].sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))[0];
  const attentionItems = [
    {
      icon: ClipboardList,
      label: latestTask?.title ?? (tasksQuery.data === undefined ? "Loading tasks…" : "No open tasks"),
      detail: latestTask ? `${openTasks.length} open task${openTasks.length === 1 ? "" : "s"} · Open task queue` : "Open the task queue",
      to: `/events/${event.slug}/portals/tasks`,
    },
    {
      icon: ClipboardList,
      label: latestSubmission?.title || (submissionsQuery.data === undefined ? "Loading submissions…" : "No submissions yet"),
      detail: latestSubmission ? `${submissions.length} submission${submissions.length === 1 ? "" : "s"} · Review submissions` : "Open the submission queue",
      to: `/events/${event.slug}/program/abstracts`,
    },
    // Incomplete speaker profiles get their own row rather than competing with the
    // other signals for one slot: a missing bio or headshot blocks the printed
    // program and the public site, and it is the one thing an organizer can chase
    // down long before decisions or scheduling are settled.
    ...(speakerSummary.profileIncomplete > 0
      ? [{
          icon: UserRoundX,
          label: `${speakerSummary.profileIncomplete} incomplete profile${speakerSummary.profileIncomplete === 1 ? "" : "s"}`,
          detail: "Missing a bio or headshot · Review speakers",
          to: `/events/${event.slug}/program/speakers?view=profile-incomplete`,
        }]
      : []),
    awaitingDecision > 0
      ? { icon: ClipboardList, label: `${awaitingDecision} awaiting decision`, detail: "Review submissions", to: `/events/${event.slug}/program/abstracts` }
      : unscheduledAccepted > 0
        ? { icon: CalendarDays, label: `${unscheduledAccepted} need a time slot`, detail: "Schedule on the agenda", to: `/events/${event.slug}/program/agenda` }
        : speakerSummary.needsAttention > 0
          ? { icon: Users, label: `${speakerSummary.needsAttention} need onboarding`, detail: "Review speakers", to: `/events/${event.slug}/program/speakers?view=needs-attention` }
          : { icon: CalendarDays, label: "Keep the program ready", detail: "Open readiness", to: `/events/${event.slug}/program/readiness` },
  ];

  // Feeds the rail's "Action items" section (#174): only the signals that are
  // actually outstanding, so an all-clear event shows an empty state instead of
  // a list of zeroes.
  const actionItems = [
    speakerSummary.profileIncomplete > 0 ? { icon: UserRoundX, label: `${speakerSummary.profileIncomplete} incomplete profile${speakerSummary.profileIncomplete === 1 ? "" : "s"}`, detail: "Missing a bio or headshot · Review speakers", to: `/events/${event.slug}/program/speakers?view=profile-incomplete` } : null,
    awaitingDecision > 0 ? { icon: ClipboardList, label: `${awaitingDecision} awaiting decision`, detail: "Review submissions", to: `/events/${event.slug}/program/abstracts` } : null,
    unscheduledAccepted > 0 ? { icon: CalendarDays, label: `${unscheduledAccepted} need a time slot`, detail: "Schedule on the agenda", to: `/events/${event.slug}/program/agenda` } : null,
    speakerSummary.needsAttention > 0 ? { icon: Users, label: `${speakerSummary.needsAttention} need onboarding`, detail: "Review speakers", to: `/events/${event.slug}/program/speakers?view=needs-attention` } : null,
  ].filter((item): item is { icon: typeof ClipboardList; label: string; detail: string; to: string } => item !== null);

  const quickAccess = [
    { icon: Megaphone, label: "Calls for papers", to: `/events/${event.slug}/program/forms` },
    { icon: ClipboardList, label: "Submissions", to: `/events/${event.slug}/program/abstracts` },
    { icon: ClipboardCheck, label: "Judge", to: `/events/${event.slug}/program/evaluation` },
    { icon: Users, label: "Speakers", to: `/events/${event.slug}/program/speakers` },
    { icon: CalendarDays, label: "Schedule", to: `/events/${event.slug}/program/agenda` },
    { icon: Mail, label: "Communications", to: `/events/${event.slug}/program/communications` },
  ];

  // First-run path. Until a CFP exists there is nothing to review or judge, so
  // the rail names the three core jobs in order rather than leaving the whole
  // CFP lifecycle to be discovered in the sidebar.
  const setupSteps = [
    { icon: Megaphone, label: "Create a CFP", detail: "The form speakers submit through", to: `/events/${event.slug}/program/forms?new=true` },
    { icon: ClipboardList, label: "Manage submissions", detail: "Review and accept what comes in", to: `/events/${event.slug}/program/abstracts` },
    { icon: ClipboardCheck, label: "Judge submissions", detail: "Assign reviewers and score", to: `/events/${event.slug}/program/evaluation` },
  ];

  const sidebarDetail = (
    <Tabs value={sidebarTab} onValueChange={(tab) => {
      if (tab === "voice-agent") {
        if (busy) return;
        setVoiceOpen(true);
      }
      setSidebarTab(tab as SidebarTab);
    }} className="flex h-full min-h-0 flex-col">
      <TabsList aria-label="Dashboard sidebar">
        <TabsTrigger value="action-items">Action items</TabsTrigger>
        <TabsTrigger value="voice-agent">Voice agent</TabsTrigger>
      </TabsList>
      <TabsContent value="action-items" className="mt-3 space-y-1.5">
        {cfpCount === 0 && !dataPending && (
          <RailSection title="Start here" storageKey="namos-dashboard-rail-setup">
            <div className="space-y-0.5">
              {setupSteps.map((step) => (
                <Link key={step.to} to={step.to} className={cn(RAIL_ROW, "gap-2")}>
                  <step.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="min-w-0 flex-1 truncate text-xs font-medium">{step.label}</p>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </RailSection>
        )}
        <RailSection title="Needs attention" storageKey="namos-dashboard-rail-attention">
          <div className="space-y-0.5">
            {attentionItems.map((item, index) => (
              <Link key={`${item.to}-${index}`} to={item.to} className={cn(RAIL_ROW, "gap-2")}>
                <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="min-w-0 flex-1 truncate text-xs font-medium">{item.label}</p>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </RailSection>
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
        <RailSection title="Action items" storageKey="namos-dashboard-rail-action-items">
          {actionItems.length > 0 ? (
            <div className="space-y-0.5">
              {actionItems.map((item) => (
                <Link key={item.to} to={item.to} className={cn(RAIL_ROW, "gap-2")}>
                  <item.icon className="h-4 w-4 text-muted-foreground" />
                  <p className="min-w-0 flex-1 truncate text-xs font-medium">{item.label}</p>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                </Link>
              ))}
            </div>
          ) : <p className="px-2 py-3 text-xs text-muted-foreground">{dataPending ? "Checking…" : "Nothing outstanding."}</p>}
        </RailSection>
      </TabsContent>
      {voiceOpen && (
        <TabsContent
          value="voice-agent"
          forceMount
          className={cn("mt-3 min-h-0 flex-1", sidebarTab !== "voice-agent" && "hidden")}
        >
          <VoiceSessionPanel eventId={event.id} onClose={closeSidebar} />
        </TabsContent>
      )}
    </Tabs>
  );

  if (access.error?.message.includes("Convex backend")) return <AppLayout title="Dashboard"><p className="text-sm text-muted-foreground">Dashboard currently requires the Convex backend.</p></AppLayout>;

  return <AppLayout title="Dashboard" utility={railCollapsed ? undefined : sidebarDetail}><div className="h-full min-h-0 flex flex-col gap-1.5 overflow-hidden">
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
              New
            </button>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggleActionItems}
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
              {/* Before a CFP exists the agent suggestions are dead ends —
                  there is no program to check yet. Point at the three jobs
                  that actually have to happen first. */}
              {cfpCount === 0 && !dataPending ? (
                <div className="flex flex-wrap justify-center gap-2">
                  {setupSteps.map((step) => (
                    <Link
                      key={step.to}
                      to={step.to}
                      className={cn("group inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors", "bg-muted/40 hover:bg-muted")}
                    >
                      <step.icon className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-foreground/80 group-hover:text-foreground">{step.label}</span>
                    </Link>
                  ))}
                </div>
              ) : access.data !== false && (
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
        {/* Render unless access is *definitively* denied. `agentRuns.canUse` is a reactive
            subscription, and this app's reactive transport has a known, still-unresolved
            defect where a subscription can stay unresolved indefinitely (see #211/#217 and
            the note in VoiceChatButton.tsx) — the socket drops roughly every 60s and heavy
            subscription sets never finish syncing. Gating on truthiness meant an unresolved
            gate removed the entire composer — text input, dictation, voice chat, send — from
            the dashboard with no way to ever get it back, which is exactly what shipped.
            `undefined` now means "show it": this is a UI affordance, not a security boundary.
            Every mutation behind it still calls assertEventOrganizerAccess server-side, so a
            user who genuinely lacks access gets a real error on submit instead of a blank page. */}
        {access.data !== false && (
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
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => void (dictation.isRecording ? dictation.stop() : dictation.start())}
                          disabled={busy || !dictation.isSupported || dictation.isProcessing}
                          aria-label={dictation.isRecording ? "Stop dictation" : "Dictation"}
                          className={cn("compact-hit-target inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors", "hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40", dictation.isRecording && "bg-destructive/10 text-destructive animate-pulse")}
                        >
                          {dictation.isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : dictation.isRecording ? <Square className="h-3 w-3 fill-current" /> : <Mic className="h-4 w-4" />}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent><p className="text-xs">{!dictation.isSupported ? "Dictation requires microphone access in this browser" : dictation.isRecording ? "Stop dictation" : "Dictate"}</p></TooltipContent>
                    </Tooltip>
                    <VoiceChatButton eventId={event.id} disabled={busy} onOpen={toggleVoiceAgent} />
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

    </div>
  </div></AppLayout>;
}
