import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, UserRound } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { AvailabilityEditor } from "@/components/availability/AvailabilityEditor";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { AddSpeakerPane } from "@/pages/program/Speakers";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRepo } from "@/data/repo";
import type { Availability, AvailabilitySlot, Event, Speaker } from "@/data/types";

function eventDates(event: Event | undefined) {
  if (!event) return [];
  const start = new Date(event.startDate);
  const end = new Date(event.endDate);
  const cursor = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate(),
  );
  const finalDate = Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth(),
    end.getUTCDate(),
  );
  const dates: number[] = [];
  for (
    let date = cursor;
    date <= finalDate && dates.length < 31;
    date += 86_400_000
  )
    dates.push(date);
  return dates;
}

function dayLabel(date: number) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export default function Availability() {
  const repo = useRepo();
  const { event: activeEvent } = useCurrentEvent();
  const [event, setEvent] = useState<Event>();
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [speakerId, setSpeakerId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [draftUnavailable, setDraftUnavailable] = useState<AvailabilitySlot[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [addingSpeaker, setAddingSpeaker] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(undefined);
    try {
      const currentEvent = activeEvent;
      if (!currentEvent) {
        setEvent(undefined);
        setSpeakers([]);
        setAvailability([]);
        return;
      }
      const scope = { eventId: currentEvent.id };
      const [nextSpeakers, nextAvailability] = await Promise.all([
        repo.speakers.list(scope),
        repo.availability.list(scope),
      ]);
      setEvent(currentEvent);
      setSpeakers(nextSpeakers);
      setAvailability(nextAvailability);
      setSpeakerId((current) =>
        nextSpeakers.some((speaker) => speaker.id === current)
          ? current
          : nextSpeakers[0]?.id,
      );
    } catch (error) {
      setEvent(undefined);
      setSpeakers([]);
      setAvailability([]);
      setLoadError(
        error instanceof Error
          ? error.message
          : "Could not load speaker availability.",
      );
    } finally {
      setLoading(false);
    }
  }, [activeEvent, repo]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedSpeaker = speakers.find((speaker) => speaker.id === speakerId);
  const selectedAvailability = availability.find(
    (record) => record.speakerId === speakerId,
  );
  useEffect(() => {
    setDraftUnavailable(selectedAvailability?.unavailable ?? []);
    setNotes(selectedAvailability?.notes ?? "");
  }, [selectedAvailability]);
  const dates = useMemo(() => eventDates(event), [event]);
  const save = async () => {
    if (!event || !speakerId) return;
    setSaving(true);
    try {
      await repo.availability.upsert({
        eventId: event.id,
        speakerId: speakerId as never,
        unavailable: draftUnavailable,
        notes: notes.trim() || undefined,
      });
      setAvailability((current) => [
        ...current.filter((record) => record.speakerId !== speakerId),
        {
          id: selectedAvailability?.id ?? `${event.id}-${speakerId}`,
          eventId: event.id,
          speakerId: speakerId as never,
          unavailable: draftUnavailable,
          notes: notes.trim() || undefined,
        },
      ]);
      setLoadError(undefined);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Could not save speaker availability.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout
      title="Speaker Availability"
      detail={
        addingSpeaker && event ? (
          <AddSpeakerPane
            event={event}
            onClose={() => setAddingSpeaker(false)}
            onCreated={(speaker) => {
              setSpeakers((current) => [...current, speaker]);
              setSpeakerId(speaker.id);
              setAddingSpeaker(false);
            }}
          />
        ) : undefined
      }
    >
      <div className="space-y-5">
        <ContentToolbar
          ariaLabel="Speaker availability actions"
          utilities={
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!event}
              onClick={() => setAddingSpeaker(true)}
            >
              Add speaker
            </Button>
          }
          primaryAction={
            <Button
              variant="accent"
              size="sm"
              disabled={!event || !speakerId || saving}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save availability"}
            </Button>
          }
        />

        {loadError && (
          <p role="alert" className="text-sm text-destructive">
            {loadError}
          </p>
        )}
        {loading ? (
          <SkeletonList rows={3} label="Loading speakers and availability…" />
        ) : !event ? (
          <EmptyState icon={CalendarDays} title="No event available" message="Create an event before reviewing speaker availability." />
        ) : speakers.length === 0 ? (
          <EmptyState
            icon={UserRound}
            title="No speakers yet"
            message={`Add a speaker to ${event.name} to record availability.`}
            action={<Button type="button" variant="accent" size="sm" onClick={() => setAddingSpeaker(true)}>Add speaker</Button>}
          />
        ) : (
          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className={cardSurfaceClasses("default", "p-6")}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-1">
                  <h2 className="font-semibold">Unavailable times</h2>
                  <p className="text-base text-muted-foreground">
                    Select the exact hours when this speaker cannot take a session.
                  </p>
                </div>
                <div className="w-full sm:w-64">
                  <Label htmlFor="availability-speaker">Speaker</Label>
                  <Select value={speakerId} onValueChange={setSpeakerId}>
                    <SelectTrigger id="availability-speaker" className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {speakers.map((speaker) => (
                        <SelectItem key={speaker.id} value={speaker.id}>
                          {speaker.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-6">
                <AvailabilityEditor
                  startsAt={event.startDate}
                  endsAt={event.endDate}
                  timezone={event.timezone}
                  value={{ unavailable: draftUnavailable, notes: notes || undefined }}
                  onChange={(next) => {
                    setDraftUnavailable(next.unavailable);
                    setNotes(next.notes ?? "");
                  }}
                  idPrefix={`organizer-availability-${speakerId}`}
                />
              </div>
            </div>

            <aside className="space-y-4">
              <div className={cardSurfaceClasses("default", "p-5")}>
                <p className="text-sm font-medium">Speaker profile</p>
                <p className="mt-3 text-base font-semibold">
                  {selectedSpeaker?.name}
                </p>
                <div className="mt-5 flex items-center gap-2 text-base text-muted-foreground">
                  <CalendarDays className="h-4 w-4" />
                  {dates.length
                    ? `${dayLabel(dates[0])}–${dayLabel(dates[dates.length - 1])}`
                    : "Event dates unavailable"}
                </div>
                <div className="mt-2 flex items-center gap-2 text-base text-muted-foreground">
                  <Clock3 className="h-4 w-4" />
                  {event.timezone}
                </div>
              </div>
              <div className={cardSurfaceClasses("default", "p-5")}>
                <div className="flex gap-3">
                  <UserRound className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Availability record</p>
                    <p className="mt-1 text-base text-muted-foreground">
                      {selectedAvailability
                        ? `${selectedAvailability.unavailable.length} unavailable time${selectedAvailability.unavailable.length === 1 ? "" : "s"} recorded.`
                        : "No unavailable times recorded."}
                    </p>
                  </div>
                </div>
              </div>
            </aside>
          </section>
        )}
      </div>
    </AppLayout>
  );
}
import { cardSurfaceClasses } from "@/components/ui/card";
