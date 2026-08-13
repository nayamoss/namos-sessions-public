import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Copy, Plus } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRepo } from "@/data/repo";
import type { Event, EventStatus } from "@/data/types";
import { cleanErrorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";

type Editor = { mode: "new" } | { mode: "duplicate"; source: Event };
const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const dateValue = (timestamp: number) =>
  new Date(timestamp).toISOString().slice(0, 10);
const timestamp = (value: string) => new Date(`${value}T12:00:00Z`).getTime();
const formatDates = (event: Event) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: event.timezone,
  }).formatRange(new Date(event.startDate), new Date(event.endDate));

function EventEditor({
  editor,
  events,
  onClose,
  onSaved,
}: {
  editor: Editor;
  events: Event[];
  onClose: () => void;
  onSaved: (eventId: string, slug: string) => void;
}) {
  const repo = useRepo();
  const source = editor.mode === "duplicate" ? editor.source : undefined;
  const [name, setName] = useState(source ? `${source.name} copy` : "");
  const [slug, setSlug] = useState(source ? `${source.slug}-copy` : "");
  const [slugTouched, setSlugTouched] = useState(Boolean(source));
  const [startDate, setStartDate] = useState(
    source ? dateValue(source.startDate) : dateValue(Date.now()),
  );
  const [endDate, setEndDate] = useState(
    source ? dateValue(source.endDate) : dateValue(Date.now() + 86_400_000),
  );
  const [pullTeam, setPullTeam] = useState(false);
  const [teamSourceId, setTeamSourceId] = useState<Event["id"] | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const save = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const cleanSlug = slugify(slug);
      if (!name.trim() || !cleanSlug)
        throw new Error("Name and slug are required.");
      if (timestamp(startDate) >= timestamp(endDate))
        throw new Error("End date must be after start date.");
      const id = source
        ? await repo.events.duplicate({
            sourceEventId: source.id,
            name: name.trim(),
            slug: cleanSlug,
            startDate: timestamp(startDate),
            endDate: timestamp(endDate),
            pullTeamFrom: pullTeam,
          })
        : await repo.events.save({
            name: name.trim(),
            slug: cleanSlug,
            timezone: "UTC",
            startDate: timestamp(startDate),
            endDate: timestamp(endDate),
            exhibitorsEnabled: false,
            sponsorsEnabled: false,
            status: "draft",
            pullTeamFromEventId: teamSourceId || undefined,
          });
      onSaved(id, cleanSlug);
    } catch (cause) {
      setError(cleanErrorMessage(cause, "Could not save event."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">
          {source ? "Duplicate event" : "New event"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {source
            ? "Configuration is copied; submissions, speakers, and schedule stay empty."
            : "Create the event workspace first. You can add rooms, tracks, and forms next."}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor="event-name">Name</Label>
        <Input
          id="event-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="event-slug">URL slug</Label>
        <Input
          id="event-slug"
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugTouched(true);
          }}
        />
        <p className="text-xs text-muted-foreground">
          /events/{slugify(slug) || "event-name"}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="event-start">Starts</Label>
          <Input
            id="event-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="event-end">Ends</Label>
          <Input
            id="event-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>
      {source ? (
        <label className="flex items-start gap-3 text-sm">
          <Checkbox
            checked={pullTeam}
            onCheckedChange={(checked) => setPullTeam(checked === true)}
          />
          <span>
            <span className="font-medium">Copy event team</span>
            <span className="mt-0.5 block text-muted-foreground">
              Bring the same event-scoped organizers and reviewers into the new
              workspace.
            </span>
          </span>
        </label>
      ) : events.length > 0 ? (
        <div className="space-y-2">
          <Label>Start with an existing team (optional)</Label>
          <Select
            value={teamSourceId || "none"}
            onValueChange={(value) =>
              setTeamSourceId(value === "none" ? "" : (value as Event["id"]))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose an event" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Do not copy a team</SelectItem>
              {events.map((event) => (
                <SelectItem key={event.id} value={event.id}>
                  {event.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Copies event-scoped organizers and reviewers only.
          </p>
        </div>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => void save()} disabled={busy}>
          {busy ? "Saving…" : source ? "Duplicate event" : "Create event"}
        </Button>
      </div>
    </div>
  );
}

export default function EventsLanding() {
  const repo = useRepo();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [filter, setFilter] = useState<"all" | EventStatus>("all");
  const [editor, setEditor] = useState<Editor>();
  const [canCreate, setCanCreate] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [rows, organizer] = await Promise.all([
        repo.events.listMine(),
        repo.organizers.getMine().catch(() => null),
      ]);
      setEvents(rows.sort((a, b) => b.startDate - a.startDate));
      setCanCreate(Boolean(organizer));
    } catch (cause) {
      setError(cleanErrorMessage(cause, "Could not load events."));
    } finally {
      setLoading(false);
    }
  }, [repo]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (params.get("new") === "1" && canCreate) setEditor({ mode: "new" });
  }, [canCreate, params]);
  const visible = useMemo(
    () =>
      filter === "all"
        ? events
        : events.filter((event) => event.status === filter),
    [events, filter],
  );
  const closeEditor = () => {
    setEditor(undefined);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("new");
        return next;
      },
      { replace: true },
    );
  };
  return (
    <AppLayout
      title="Events"
      detail={
        editor ? (
          <EventEditor
            editor={editor}
            events={events}
            onClose={closeEditor}
            onSaved={(_id, slug) => navigate(`/events/${slug}/dashboard`)}
          />
        ) : undefined
      }
    >
      <div className="space-y-5">
        <ContentToolbar
          ariaLabel="Event controls"
          utilities={
            <div className="flex gap-1 rounded-md bg-muted p-1">
              {(["all", "draft", "published", "archived"] as const).map(
                (status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setFilter(status)}
                    className={cn(
                      "rounded px-2.5 py-1.5 text-xs font-medium capitalize",
                      filter === status
                        ? "bg-background text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {status}
                  </button>
                ),
              )}
            </div>
          }
          primaryAction={
            canCreate ? (
              <Button onClick={() => setEditor({ mode: "new" })}>
                <Plus className="mr-2 h-4 w-4" />
                New event
              </Button>
            ) : undefined
          }
        />
        {error && (
          <div className="flex items-center gap-3">
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
            <Button size="sm" variant="ghost" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        )}
        {loading ? (
          <SkeletonList rows={3} label="Loading events…" />
        ) : visible.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((event) => (
              <article key={event.id} className="rounded-xl bg-muted/60 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold">
                      {event.name}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatDates(event)}
                    </p>
                  </div>
                  <span className="rounded-md bg-background px-2 py-1 text-xs font-medium capitalize">
                    {event.status}
                  </span>
                </div>
                <div className="mt-5 flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => navigate(`/events/${event.slug}/dashboard`)}
                  >
                    Open
                  </Button>
                  {canCreate && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        setEditor({ mode: "duplicate", source: event })
                      }
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Duplicate
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-xl bg-muted/50 p-6">
            <EmptyState
              message={
                events.length
                  ? "No events match this status."
                  : "No events yet."
              }
              action={
                canCreate ? (
                  <Button onClick={() => setEditor({ mode: "new" })}>
                    <CalendarDays className="mr-2 h-4 w-4" />
                    Create your first event
                  </Button>
                ) : undefined
              }
            />
          </div>
        )}
      </div>
    </AppLayout>
  );
}
