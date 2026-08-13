import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, ClipboardList, FileCheck2, Users } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { StatCard } from "@/components/shared/StatCard";
import { useRepo } from "@/data/repo";
import type { AgendaItem, Comm, Event, OnboardingTask, Speaker, Submission, SubmissionStatus } from "@/data/types";
import { projectSpeakerOperationsRows, summarizeSpeakerOperations } from "@/lib/speaker-operations";

const statuses: Array<{ status: SubmissionStatus; label: string }> = [
  { status: "accepted", label: "Accepted" },
  { status: "pending", label: "Pending" },
  { status: "accept_queue", label: "Accept Queue" },
  { status: "decline_queue", label: "Decline Queue" },
  { status: "declined", label: "Declined" },
  { status: "withdrawn", label: "Withdrawn" },
  { status: "draft", label: "Draft" },
];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function DashboardHome() {
  const repo = useRepo();
  const { event: currentEvent } = useCurrentEvent();
  const [event, setEvent] = useState<Event>();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [tasks, setTasks] = useState<OnboardingTask[]>([]);
  const [comms, setComms] = useState<Comm[]>([]);
  const [loadError, setLoadError] = useState<string>();

  const load = useCallback(async () => {
    setLoadError(undefined);
    try {
      const nextEvent = currentEvent;
      setEvent(nextEvent);
      if (!nextEvent) {
        setSubmissions([]);
        setAgenda([]);
        setSpeakers([]);
        setTasks([]);
        setComms([]);
        return;
      }
      const scope = { eventId: nextEvent.id };
      const [nextSubmissions, nextAgenda, nextSpeakers, nextTasks, nextComms] = await Promise.all([
        repo.submissions.list(scope),
        repo.agenda.list(scope),
        repo.speakers.list(scope),
        repo.tasks.list(scope),
        repo.comms.list(scope),
      ]);
      setSubmissions(nextSubmissions);
      setAgenda(nextAgenda);
      setSpeakers(nextSpeakers);
      setTasks(nextTasks);
      setComms(nextComms);
    } catch (error) {
      setSubmissions([]);
      setAgenda([]);
      setSpeakers([]);
      setTasks([]);
      setComms([]);
      setLoadError(error instanceof Error ? error.message : "Could not load dashboard data.");
    }
  }, [currentEvent, repo]);

  useEffect(() => { void load(); }, [load]);


  const counts = useMemo(() => Object.fromEntries(statuses.map(({ status }) => [status, submissions.filter((submission) => submission.status === status).length])) as Record<SubmissionStatus, number>, [submissions]);
  const acceptedSpeakerCount = useMemo(() => new Set(submissions.filter((submission) => submission.status === "accepted").flatMap((submission) => submission.speakerIds)).size, [submissions]);
  const speakerSummary = useMemo(() => summarizeSpeakerOperations(projectSpeakerOperationsRows({ speakers, submissions, tasks, comms, now: Date.now() })), [comms, speakers, submissions, tasks]);
  const unscheduledAccepted = useMemo(() => {
    const scheduledSubmissionIds = new Set(agenda.flatMap((item) => item.submissionId ? [item.submissionId] : []));
    return submissions.filter((submission) => submission.status === "accepted" && !scheduledSubmissionIds.has(submission.id)).length;
  }, [agenda, submissions]);
  const awaitingDecision = counts.pending + counts.accept_queue + counts.decline_queue;
  const nudges = [
    unscheduledAccepted > 0 ? { count: unscheduledAccepted, singular: "accepted session still needs a time slot", plural: "accepted sessions still need a time slot", to: `/events/${currentEvent.slug}/program/agenda` } : null,
    awaitingDecision > 0 ? { count: awaitingDecision, singular: "submission is awaiting a decision", plural: "submissions are awaiting a decision", to: `/events/${currentEvent.slug}/program/abstracts` } : null,
    speakerSummary.needsAttention > 0 ? { count: speakerSummary.needsAttention, singular: "accepted speaker needs onboarding attention", plural: "accepted speakers need onboarding attention", to: `/events/${currentEvent.slug}/program/speakers?view=needs-attention` } : null,
  ].filter((nudge): nudge is { count: number; singular: string; plural: string; to: string } => nudge !== null);

  return <AppLayout title={greeting()}><div className="space-y-4">
    <section className="space-y-4" aria-label="Today">
      {loadError && <p role="alert" className="text-sm text-destructive">{loadError}</p>}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Submissions" value={submissions.length} icon={ClipboardList} />
        <StatCard label="Accepted speakers" value={acceptedSpeakerCount} icon={Users} />
        <StatCard label="Pending review" value={awaitingDecision} icon={FileCheck2} />
        <StatCard label="Sessions scheduled" value={agenda.length} icon={CalendarDays} />
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
        {statuses.map(({ status, label }) => <StatCard key={status} label={label} value={counts[status]} />)}
      </div>
      {nudges.length > 0 && <p className="text-sm text-muted-foreground">Also check: {nudges.map((nudge, index) => <span key={nudge.to}>{index > 0 && " · "}<Link className="font-medium text-destructive hover:underline" to={nudge.to}>{nudge.count} {nudge.count === 1 ? nudge.singular : nudge.plural}</Link></span>)}</p>}
    </section>
  </div></AppLayout>;
}
