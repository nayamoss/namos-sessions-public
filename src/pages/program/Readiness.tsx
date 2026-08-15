import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ClipboardList,
  MailWarning,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { ReadinessCategoryCard } from "@/components/shared/ReadinessCategoryCard";
import { Button } from "@/components/ui/button";
import { useRepo } from "@/data/repo";
import type {
  AgendaConflict,
  AgendaItem,
  Comm,
  Event,
  OnboardingTask,
  Speaker,
  Submission,
} from "@/data/types";
import {
  filterReadinessGroupsByDay,
  projectReadinessGroups,
  type ReadinessCategory,
} from "@/lib/readiness";
import { projectSpeakerOperationsRows } from "@/lib/speaker-operations";
import { agendaEventDays } from "./Agenda";

const categories: Array<{
  category: ReadinessCategory;
  icon: typeof AlertTriangle;
}> = [
  { category: "agenda_conflicts", icon: AlertTriangle },
  { category: "speaker_confirmations", icon: UsersRound },
  { category: "onboarding_tasks", icon: ClipboardList },
  { category: "proposal_decisions", icon: UserRoundCheck },
  { category: "comms_delivery", icon: MailWarning },
];
type ReadinessData = {
  event?: Event;
  agenda: AgendaItem[];
  conflicts: AgendaConflict[];
  speakers: Speaker[];
  submissions: Submission[];
  tasks: OnboardingTask[];
  comms: Comm[];
  errors: Partial<Record<ReadinessCategory, string>>;
};
const emptyData: ReadinessData = {
  agenda: [],
  conflicts: [],
  speakers: [],
  submissions: [],
  tasks: [],
  comms: [],
  errors: {},
};
function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Could not load this readiness signal.";
}

export default function Readiness() {
  const repo = useRepo();
  const { event } = useCurrentEvent();
  const [data, setData] = useState<ReadinessData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [day, setDay] = useState<string | "all">("all");
  const load = useCallback(async () => {
    setLoading(true);
    const scope = { eventId: event.id };
    const results = await Promise.allSettled([
      repo.agenda.list(scope),
      repo.agenda.detectConflicts(scope),
      repo.speakers.list(scope),
      repo.submissions.list(scope),
      repo.tasks.list(scope),
      repo.comms.list(scope),
    ]);
    const value = <T,>(index: number): T[] =>
      results[index].status === "fulfilled"
        ? (results[index].value as T[])
        : [];
    const errors: Partial<Record<ReadinessCategory, string>> = {};
    if (results[0].status === "rejected")
      errors.agenda_conflicts = message(results[0].reason);
    else if (results[1].status === "rejected")
      errors.agenda_conflicts = message(results[1].reason);
    if (results[2].status === "rejected")
      errors.speaker_confirmations = message(results[2].reason);
    if (results[3].status === "rejected")
      errors.proposal_decisions = message(results[3].reason);
    if (results[4].status === "rejected")
      errors.onboarding_tasks = message(results[4].reason);
    if (results[5].status === "rejected")
      errors.comms_delivery = message(results[5].reason);
    setData({
      event,
      agenda: value<AgendaItem>(0),
      conflicts: value<AgendaConflict>(1),
      speakers: value<Speaker>(2),
      submissions: value<Submission>(3),
      tasks: value<OnboardingTask>(4),
      comms: value<Comm>(5),
      errors,
    });
    setLoading(false);
  }, [event, repo]);
  useEffect(() => {
    void load();
  }, [load]);
  const groups = useMemo(
    () =>
      data.event
        ? projectReadinessGroups({
            event: data.event,
            agenda: data.agenda,
            agendaConflicts: data.conflicts,
            speakerRows: projectSpeakerOperationsRows({
              speakers: data.speakers,
              submissions: data.submissions,
              tasks: data.tasks,
              comms: data.comms,
              now: Date.now(),
            }),
            submissions: data.submissions,
            tasks: data.tasks,
            comms: data.comms,
            now: Date.now(),
          })
        : categories.map(({ category }) => ({
            category,
            label:
              category === "agenda_conflicts"
                ? "Agenda conflicts"
                : category === "speaker_confirmations"
                  ? "Speaker confirmations"
                  : category === "onboarding_tasks"
                    ? "Onboarding tasks"
                    : category === "proposal_decisions"
                      ? "Proposal decisions"
                      : "Comms delivery",
            items: [],
          })),
    [data],
  );
  const filtered = useMemo(
    () => filterReadinessGroupsByDay(groups, day),
    [day, groups],
  );
  const days = data.event
    ? agendaEventDays(data.event.startDate, data.event.endDate)
    : [];
  return (
    <AppLayout title="Readiness">
      <div className="space-y-4">
        <section
          className="flex flex-wrap gap-2"
          aria-label="Filter readiness by event day"
        >
          <Button
            id="readiness-day-all"
            type="button"
            variant={day === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setDay("all")}
          >
            All
          </Button>
          {days.map((value) => (
            <Button
              key={value}
              type="button"
              variant={day === value ? "default" : "outline"}
              size="sm"
              onClick={() => setDay(value)}
            >
              {new Intl.DateTimeFormat("en-US", {
                month: "short",
                day: "numeric",
                timeZone: data.event?.timezone,
              }).format(new Date(`${value}T12:00:00Z`))}
            </Button>
          ))}
        </section>
        {loading ? (
          <div
            className="space-y-3"
            aria-busy="true"
            aria-label="Loading readiness"
          >
            <>
              {categories.map(({ category }) => (
                <div
                  key={category}
                  className={cardSurfaceClasses("default", "animate-pulse bg-muted/60 p-5")}
                >
                  <div className="h-4 w-40 rounded bg-muted" />
                  <div className="mt-4 h-4 w-3/4 rounded bg-muted" />
                </div>
              ))}
            </>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((group) => {
              const original = groups.find(
                (candidate) => candidate.category === group.category,
              )!;
              const notDateSpecificCount =
                day === "all"
                  ? 0
                  : original.items.filter(
                      (item) => item.eventDate === undefined,
                    ).length;
              return (
                <ReadinessCategoryCard
                  key={group.category}
                  label={group.label}
                  icon={
                    categories.find((item) => item.category === group.category)!
                      .icon
                  }
                  items={group.items}
                  notDateSpecificCount={notDateSpecificCount}
                  loadError={data.errors[group.category]}
                />
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
import { cardSurfaceClasses } from "@/components/ui/card";
