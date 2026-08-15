import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CharCounterInput } from "@/components/shared/CharCounterInput";
import { parseDateTimeLocalValue, toDateTimeLocalValue } from "@/lib/datetime";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { FormField } from "@/components/shared/FormField";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { ToggleField } from "@/components/shared/ToggleField";
import { useRepo } from "@/data/repo";
import type { Event, EventId, Room, Track } from "@/data/types";

const blankEvent: Omit<Event, "id"> = {
  name: "Untitled event",
  slug: "untitled-event",
  type: "Conference",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  startDate: Date.now(),
  endDate: Date.now() + 86400000,
  exhibitorsEnabled: false,
  sponsorsEnabled: false,
  status: "draft",
};
// A datetime-local input's value can be empty or momentarily incomplete while the user is
// typing (e.g. mid-way through entering a year). Guarding here keeps a bad intermediate
// keystroke from ever reaching state as NaN, which previously crashed the whole page the
// next time `toDateTimeLocalValue` ran `.toISOString()` on an invalid Date.
type EditableCollectionItem = {
  id?: string;
  eventId: EventId;
  name: string;
  sortOrder: number;
};
type EditableRoom = Omit<Room, "id"> & { id?: string };
type EditableTrack = Omit<Track, "id"> & { id?: string };
export default function EventDetails() {
  const repo = useRepo();
  const { event: activeEvent } = useCurrentEvent();
  const [event, setEvent] = useState<Omit<Event, "id"> & { id?: Event["id"] }>(
    blankEvent,
  );
  const [rooms, setRooms] = useState<EditableRoom[]>([]);
  const [tracks, setTracks] = useState<EditableTrack[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const nextEvent = activeEvent;
      if (!nextEvent) {
        setEvent(blankEvent);
        setRooms([]);
        setTracks([]);
        return;
      }
      const [nextRooms, nextTracks] = await Promise.all([
        repo.events.listRooms({ eventId: nextEvent.id }),
        repo.events.listTracks({ eventId: nextEvent.id }),
      ]);
      setEvent(nextEvent);
      setRooms(nextRooms);
      setTracks(nextTracks);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load event settings.",
      );
    } finally {
      setLoading(false);
    }
  }, [activeEvent, repo]);
  useEffect(() => {
    void load();
  }, [load]);
  // Re-fetches only rooms/tracks (to pick up server-assigned ids for newly created rows).
  // Deliberately does NOT touch `event` — `save()` already holds the exact fields it just
  // persisted, and re-deriving `event` from `activeEvent` here would be wrong: that reactive
  // query hasn't necessarily caught up with the mutation yet, so doing so previously clobbered
  // just-saved toggles (e.g. Sponsors) back to their pre-save value for a render or two.
  const reloadCollections = useCallback(
    async (eventId: EventId) => {
      const [nextRooms, nextTracks] = await Promise.all([
        repo.events.listRooms({ eventId }),
        repo.events.listTracks({ eventId }),
      ]);
      setRooms(nextRooms);
      setTracks(nextTracks);
    },
    [repo],
  );
  const save = async () => {
    setSaving(true);
    try {
      const eventId = await repo.events.save(event);
      await Promise.all(
        rooms.map((room, sortOrder) =>
          repo.events.saveRoom({
            ...(room.id ? { id: room.id } : {}),
            eventId,
            name: room.name,
            capacity: room.capacity,
            sortOrder,
          }),
        ),
      );
      await Promise.all(
        tracks.map((track, sortOrder) =>
          repo.events.saveTrack({
            ...(track.id ? { id: track.id } : {}),
            eventId,
            name: track.name,
            color: track.color,
            sortOrder,
          }),
        ),
      );
      setEvent((current) => ({ ...current, id: eventId }));
      await reloadCollections(eventId);
      setError(undefined);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not save event settings.",
      );
    } finally {
      setSaving(false);
    }
  };
  const removeRoom = async (room: EditableRoom, index: number) => {
    try {
      if (room.id && event.id)
        await repo.events.removeRoom({ eventId: event.id, id: room.id });
      setRooms((current) =>
        current.filter((_, currentIndex) => currentIndex !== index),
      );
      setError(undefined);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not remove room.",
      );
    }
  };
  const removeTrack = async (track: EditableTrack, index: number) => {
    try {
      if (track.id && event.id)
        await repo.events.removeTrack({ eventId: event.id, id: track.id });
      setTracks((current) =>
        current.filter((_, currentIndex) => currentIndex !== index),
      );
      setError(undefined);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not remove track.",
      );
    }
  };
  const update = <Key extends keyof typeof event>(
    key: Key,
    value: (typeof event)[Key],
  ) => setEvent((current) => ({ ...current, [key]: value }));
  const setItems = setRooms;
  return (
    <AppLayout title="Event Settings">
      <div className="space-y-4">
        <ContentToolbar
          ariaLabel="Event settings actions"
          primaryAction={
            <Button
              variant="accent"
              size="sm"
              onClick={() => void save()}
              disabled={loading || saving}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          }
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {loading ? (
          <SkeletonList rows={4} label="Loading event settings…" />
        ) : (
          <>
            <section className={cardSurfaceClasses("default", "space-y-6 p-6")}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField label="Event Name">
                  <Input
                    value={event.name}
                    onChange={(e) => update("name", e.target.value)}
                  />
                </FormField>
                <FormField label="Event Slug">
                  <Input
                    value={event.slug}
                    onChange={(e) => update("slug", e.target.value)}
                  />
                </FormField>
                <FormField label="Event Type">
                  <Input
                    value={event.type ?? ""}
                    onChange={(e) => update("type", e.target.value)}
                  />
                </FormField>
                <FormField label="Event Website URL">
                  <Input
                    type="url"
                    placeholder="https://"
                    value={event.websiteUrl ?? ""}
                    onChange={(e) => update("websiteUrl", e.target.value)}
                  />
                </FormField>
                <FormField label="Event Location">
                  <Input
                    autoComplete="address-level2"
                    value={event.location ?? ""}
                    onChange={(e) => update("location", e.target.value)}
                  />
                </FormField>
                <FormField label="Timezone">
                  <Input
                    value={event.timezone}
                    onChange={(e) => update("timezone", e.target.value)}
                  />
                </FormField>
                <FormField label="Starts At">
                  <Input
                    type="datetime-local"
                    value={toDateTimeLocalValue(event.startDate)}
                    onChange={(e) => {
                      const ms = parseDateTimeLocalValue(e.target.value);
                      if (ms !== undefined) update("startDate", ms);
                    }}
                  />
                </FormField>
                <FormField label="Ends At">
                  <Input
                    type="datetime-local"
                    value={toDateTimeLocalValue(event.endDate)}
                    onChange={(e) => {
                      const ms = parseDateTimeLocalValue(e.target.value);
                      if (ms !== undefined) update("endDate", ms);
                    }}
                  />
                </FormField>
              </div>
              <FormField label="Theme">
                <CharCounterInput
                  value={event.theme ?? ""}
                  maxLength={1000}
                  onChange={(theme) => update("theme", theme)}
                />
              </FormField>
              <div className="flex flex-wrap gap-6">
                <ToggleField
                  label="Exhibitors"
                  checked={event.exhibitorsEnabled}
                  onCheckedChange={(exhibitorsEnabled) =>
                    update("exhibitorsEnabled", exhibitorsEnabled)
                  }
                />
                <ToggleField
                  label="Sponsors"
                  checked={event.sponsorsEnabled}
                  onCheckedChange={(sponsorsEnabled) =>
                    update("sponsorsEnabled", sponsorsEnabled)
                  }
                />
              </div>
            </section>
            <Collection
              title="Rooms"
              items={rooms}
              setItems={setItems}
              onRemove={removeRoom}
            />
            <Collection
              title="Tracks"
              items={tracks}
              setItems={setItems}
              onRemove={removeTrack}
            />
          </>
        )}
      </div>
    </AppLayout>
  );
}
function Collection<Item extends EditableCollectionItem>({
  title,
  items,
  setItems,
  onRemove,
}: {
  title: string;
  items: Item[];
  setItems: React.Dispatch<React.SetStateAction<Item[]>>;
  onRemove: (item: Item, index: number) => Promise<void>;
}) {
  return (
    <section className={cardSurfaceClasses("default", "p-6")}>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setItems((current) => [
              ...current,
              {
                eventId: "" as EventId,
                name: "",
                sortOrder: current.length,
              } as Item,
            ])
          }
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add
        </Button>
      </div>
      <div className="mt-4 space-y-2">
        {items.map((item, index) => (
          <div key={item.id ?? `new-${index}`} className="flex gap-2">
            <Input
              value={item.name}
              placeholder={`${title.slice(0, -1)} name`}
              onChange={(e) =>
                setItems((current) =>
                  current.map((currentItem, currentIndex) =>
                    currentIndex === index
                      ? { ...currentItem, name: e.target.value }
                      : currentItem,
                  ),
                )
              }
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void onRemove(item, index)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
import { cardSurfaceClasses } from "@/components/ui/card";
