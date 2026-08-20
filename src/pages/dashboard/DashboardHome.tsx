import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, ChevronDown, ClipboardCheck, ClipboardList, Mail, Megaphone, UserRoundX, Users } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { AgentWorkspace } from "@/components/agent/AgentWorkspace";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useRepoQuery } from "@/data/reactive";
import type { AgendaItem, Comm, OnboardingTask, Speaker, Submission, SubmissionForm } from "@/data/types";
import { projectSpeakerOperationsRows, summarizeSpeakerOperations } from "@/lib/speaker-operations";

// Shared empty fallback: a fresh `[]` per render would give every dependent
// useMemo a new identity each pass and recompute the whole dashboard.
const EMPTY: readonly unknown[] = [];

// Hover surface for an interactive row. Split out of the geometry classes the
// way AppLayout composes its nav links: the resting row has no fill of its own,
// so the hover fill is a state, not a card surface.
const RAIL_ROW = cn("flex items-center rounded-lg p-2 transition-colors", "hover:bg-muted");

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

export default function DashboardHome() {
  const { event } = useCurrentEvent();

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
    <div className="space-y-1.5" aria-label="Dashboard quick access">
        {cfpCount === 0 && !dataPending && (
          <RailSection title="Start here" storageKey="namos-dashboard-rail-setup">
            <div className="space-y-0.5">
              {setupSteps.map((step) => (
                <Link key={step.to} to={step.to} className={cn(RAIL_ROW, "gap-2")}>
                  <step.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="min-w-0 flex-1 truncate text-xs font-medium">{step.label}</p>
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
                </Link>
              ))}
            </div>
          ) : <p className="px-2 py-3 text-xs text-muted-foreground">{dataPending ? "Checking…" : "Nothing outstanding."}</p>}
        </RailSection>
    </div>
  );

  return (
    <AppLayout title="Program Control Room" utility={sidebarDetail} contentVariant="conversation">
      <AgentWorkspace />
    </AppLayout>
  );
}
