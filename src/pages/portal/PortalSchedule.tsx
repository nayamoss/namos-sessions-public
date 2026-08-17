import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CalendarPlus, Download } from "lucide-react";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { Button } from "@/components/ui/button";
import { useRepo } from "@/data/repo";
import type { SpeakerAgendaItem } from "@/data/types";
import { calendarInvite } from "@/lib/calendar-invite";
import { calendarSchedule } from "@/lib/calendar-schedule";
import { eventDateTime, eventDateTimeToEpoch } from "@/lib/event-time";
import { publishedAgendaForSpeaker } from "@/lib/portal-schedule";
import { usePortalIdentity } from "./PortalIdentity";

function formatClock(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

function formatSessionDate(value: number, timeZone: string) {
  const local = eventDateTime(value, timeZone);
  const midday = eventDateTimeToEpoch(local.date, "12:00", timeZone);
  if (midday === undefined) return local.date;
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(midday);
}

function safeFilename(value: string) {
  return value.trim().replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "schedule";
}

function downloadCalendar(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function inviteInput(item: SpeakerAgendaItem) {
  return {
    uid: `${item.id}@sessionboard-clone`,
    title: item.title,
    startTime: item.startTime,
    endTime: item.endTime,
    location: item.roomName,
  };
}

export function PortalSchedule() {
  const repo = useRepo();
  const { event, selectedSpeaker } = usePortalIdentity();
  const [items, setItems] = useState<SpeakerAgendaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    if (!event || !selectedSpeaker) {
      setItems([]);
      setLoading(false);
      return () => { active = false; };
    }

    setLoading(true);
    setError(undefined);
    void repo.agenda.listForSpeaker({ eventId: event.id, speakerId: selectedSpeaker.id }).then((agenda) => {
      if (!active) return;
      setItems(publishedAgendaForSpeaker(agenda, selectedSpeaker.id));
    }).catch((cause) => {
      if (active) {
        setItems([]);
        setError(cause instanceof Error ? cause.message : "Could not load your schedule.");
      }
    }).finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [event, repo, selectedSpeaker]);

  const fullSchedule = useMemo(
    () => items.map(inviteInput),
    [items],
  );

  if (!event || !selectedSpeaker) return null;

  return (
    <div className="space-y-4">
      <ContentToolbar
        ariaLabel="Schedule actions"
        primaryAction={
          <Button
            type="button"
            variant="accent"
            size="sm"
            disabled={!items.length}
            onClick={() => downloadCalendar(calendarSchedule(fullSchedule), `${safeFilename(event.name)}-schedule.ics`)}
          >
            <Download className="mr-1.5 h-4 w-4" />Download full schedule
          </Button>
        }
      />
      {error ? (
        <p role="alert" className="text-sm text-destructive">{error}</p>
      ) : loading ? (
        <SkeletonList rows={3} label="Loading your schedule…" />
      ) : items.length === 0 ? (
        <section className={cardSurfaceClasses("default")}>
          <EmptyState icon={CalendarDays} title="Your schedule has not been published yet" message="Confirmed sessions will appear here as soon as the organizer publishes the event schedule." />
        </section>
      ) : (
        <section className="grid gap-4 md:grid-cols-2" aria-label="Published sessions">
          {items.map((item) => {
            const start = eventDateTime(item.startTime, event.timezone);
            const end = eventDateTime(item.endTime, event.timezone);
            return (
              <article key={item.id} className={cardSurfaceClasses("default", "bg-muted p-5")}>
                <p className="text-sm text-muted-foreground">{formatSessionDate(item.startTime, event.timezone)}</p>
                <h2 className="mt-1 text-base font-semibold">{item.title}</h2>
                <p className="mt-3 text-sm">{formatClock(start.time)}–{formatClock(end.time)}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {item.roomName}{item.trackName ? ` · ${item.trackName}` : ""}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => downloadCalendar(calendarInvite(inviteInput(item)), `${safeFilename(item.title)}.ics`)}
                >
                  <CalendarPlus className="mr-1.5 h-4 w-4" />Add to calendar
                </Button>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
import { cardSurfaceClasses } from "@/components/ui/card";
