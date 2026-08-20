import { useCallback, useEffect, useRef, useState } from "react";
import { Save, Trash2, X } from "lucide-react";
import { useCurrentEvent } from "@/components/EventContext";
import { useOptionalSettingsModal } from "@/components/settings/SettingsModalContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CharCounterInput } from "@/components/shared/CharCounterInput";
import { parseDateTimeLocalValue, toDateTimeLocalValue } from "@/lib/datetime";
import { FormField } from "@/components/shared/FormField";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { ToggleField } from "@/components/shared/ToggleField";
import { TimezoneCombobox } from "@/components/shared/TimezoneCombobox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
const accentPalette = ["#F59E0B", "#EF4444", "#EC4899", "#8B5CF6", "#3B82F6", "#14B8A6", "#22C55E"];

export default function EventDetails() {
  const repo = useRepo();
  const { event: activeEvent } = useCurrentEvent();
  const settingsModal = useOptionalSettingsModal();
  const [event, setEvent] = useState<Omit<Event, "id"> & { id?: Event["id"] }>(
    blankEvent,
  );
  const [rooms, setRooms] = useState<EditableRoom[]>([]);
  const [tracks, setTracks] = useState<EditableTrack[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  // What's currently persisted, so edits can be told apart from a fresh load/save. Nothing
  // in this panel autosaves — Rooms/Tracks rows exist only in this component's state until
  // Save is clicked — so without this, closing the settings modal (Escape, an outside click,
  // switching tabs) silently threw away whatever the organizer had just typed.
  const savedSnapshot = useRef("");
  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const nextEvent = activeEvent;
      if (!nextEvent) {
        setEvent(blankEvent);
        setRooms([]);
        setTracks([]);
        savedSnapshot.current = JSON.stringify([blankEvent, [], []]);
        return;
      }
      const [nextRooms, nextTracks] = await Promise.all([
        repo.events.listRooms({ eventId: nextEvent.id }),
        repo.events.listTracks({ eventId: nextEvent.id }),
      ]);
      setEvent(nextEvent);
      setRooms(nextRooms);
      setTracks(nextTracks);
      savedSnapshot.current = JSON.stringify([nextEvent, nextRooms, nextTracks]);
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
  useEffect(() => {
    if (loading) return;
    const dirty = JSON.stringify([event, rooms, tracks]) !== savedSnapshot.current;
    settingsModal?.setHasUnsavedChanges(dirty);
  }, [event, rooms, tracks, loading, settingsModal]);
  // The panel can unmount (tab switch, modal close) without a render in between to report
  // "clean" — clear the flag directly rather than relying on the effect above.
  useEffect(() => () => settingsModal?.setHasUnsavedChanges(false), [settingsModal]);
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
      return { nextRooms, nextTracks };
    },
    [repo],
  );
  // Publishing is what makes an event's public surfaces reachable — including its call
  // for proposals, which cannot be opened at all until the event is published. There was
  // previously no control for it anywhere in the app, so every event stayed on the
  // "draft" the creation wizard hardcodes. `status` already round-trips through
  // events.save, so this only had to be surfaced, not plumbed.
  const changeStatus = async (status: Event["status"]) => {
    if (!event.id) {
      setError("Save this event before publishing it.");
      return;
    }
    setPublishing(true);
    setError(undefined);
    const next = { ...event, status };
    try {
      await repo.events.save(next);
      setEvent(next);
      savedSnapshot.current = JSON.stringify([next, rooms, tracks]);
      settingsModal?.setHasUnsavedChanges(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not change this event's status.",
      );
    } finally {
      setPublishing(false);
    }
  };

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
      const savedEvent = { ...event, id: eventId };
      setEvent(savedEvent);
      const { nextRooms, nextTracks } = await reloadCollections(eventId);
      savedSnapshot.current = JSON.stringify([savedEvent, nextRooms, nextTracks]);
      settingsModal?.setHasUnsavedChanges(false);
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
  return (
    <>
      <div className="space-y-4">
        <div className="flex min-h-9 items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-foreground">Event details</h2>
          <TooltipProvider>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading || saving || publishing || !event.id}
                onClick={() =>
                  void changeStatus(event.status === "published" ? "draft" : "published")
                }
              >
                {publishing
                  ? "Saving…"
                  : event.status === "published"
                    ? "Unpublish"
                    : "Publish event"}
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="accent" size="icon" className="h-8 w-8" onClick={() => void save()} disabled={loading || saving} aria-label={saving ? "Saving event" : "Save event"}>
                    <Save className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{saving ? "Saving…" : "Save"}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => settingsModal?.closeSettings()} aria-label="Close settings">
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Close</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
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
                  <TimezoneCombobox
                    value={event.timezone}
                    onChange={(timezone) => update("timezone", timezone)}
                  />
                </FormField>
                <FormField label="Event color">
                  <div className="flex flex-wrap items-center gap-2">
                    {accentPalette.map((color) => (
                      <Button key={color} type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-full border border-border p-0" style={{ backgroundColor: color }} aria-label={`Use ${color}`} aria-pressed={event.accentColor?.toUpperCase() === color} onClick={() => update("accentColor", color)} />
                    ))}
                    <Input value={event.accentColor ?? ""} onChange={(change) => update("accentColor", change.target.value)} placeholder="#F59E0B" pattern="^#[0-9A-Fa-f]{6}$" className="h-8 w-28 font-mono uppercase" aria-label="Custom event color" />
                  </div>
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
                <FormField label="Schedule starts">
                  <Input
                    type="time"
                    value={event.scheduleStartTime ?? "08:00"}
                    onChange={(e) => update("scheduleStartTime", e.target.value)}
                  />
                </FormField>
                <FormField label="Schedule ends">
                  <Input
                    type="time"
                    value={event.scheduleEndTime ?? "18:00"}
                    onChange={(e) => update("scheduleEndTime", e.target.value)}
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
              setItems={setRooms}
              onRemove={removeRoom}
            />
            <Collection
              title="Tracks"
              items={tracks}
              setItems={setTracks}
              onRemove={removeTrack}
            />
          </>
        )}
      </div>
    </>
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
  const newestInputRef = useRef<HTMLInputElement>(null);
  const focusNewestOnNextRender = useRef(false);
  useEffect(() => {
    if (focusNewestOnNextRender.current) {
      focusNewestOnNextRender.current = false;
      newestInputRef.current?.focus();
    }
  }, [items.length]);
  return (
    <section className={cardSurfaceClasses("default", "p-6")}>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            focusNewestOnNextRender.current = true;
            setItems((current) => [
              ...current,
              {
                eventId: "" as EventId,
                name: "",
                sortOrder: current.length,
              } as Item,
            ]);
          }}
        >
          Add
        </Button>
      </div>
      <div className="mt-4 space-y-2">
        {items.map((item, index) => (
          <div key={item.id ?? `new-${index}`} className="flex gap-2">
            <Input
              ref={index === items.length - 1 ? newestInputRef : undefined}
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
