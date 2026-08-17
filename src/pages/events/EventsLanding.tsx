import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Copy, MoreHorizontal, Trash2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { DetailPane } from "@/components/shared/DetailPane";
import { EmptyState } from "@/components/shared/EmptyState";
import { DataGrid, type DataGridColumn } from "@/components/shared/DataGrid";
import { SegmentedControl } from "@/components/shared/SegmentedControl";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { EventCreationWizard } from "./EventCreationWizard";

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
    <DetailPane title={source ? "Duplicate event" : "New event"} onClose={onClose}>
      <div className="space-y-5">
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
      <div className="grid gap-3 sm:grid-cols-2">
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
    </DetailPane>
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
  const [deleteCandidate, setDeleteCandidate] = useState<Event>();
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [manageableEventIds, setManageableEventIds] = useState<Set<string>>(new Set());
  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const rows = await repo.events.listMine();
      setEvents(rows.sort((a, b) => b.startDate - a.startDate));
      const manageable = await Promise.all(
        rows.map(async (event) => [event.id, await repo.eventMembers.canManage({ eventId: event.id })] as const),
      );
      setManageableEventIds(new Set(manageable.filter(([, allowed]) => allowed).map(([id]) => id)));
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
    if (params.get("new") === "1") setEditor({ mode: "new" });
  }, [params]);
  const visible = useMemo(
    () =>
      filter === "all"
        ? events
        : events.filter((event) => event.status === filter),
    [events, filter],
  );
  const closeEditor = () => {
    setEditor(undefined);
    void load();
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("new");
        return next;
      },
      { replace: true },
    );
  };
  const closeDelete = (force = false) => {
    if (deleting && !force) return;
    setDeleteCandidate(undefined);
    setDeleteConfirmation("");
  };
  const removeEvent = async () => {
    if (!deleteCandidate || deleteConfirmation !== deleteCandidate.name) return;
    setDeleting(true);
    setError(undefined);
    try {
      await repo.events.remove(deleteCandidate.id);
      closeDelete(true);
      await load();
    } catch (cause) {
      setError(cleanErrorMessage(cause, "Could not delete event."));
    } finally {
      setDeleting(false);
    }
  };
  const columns: DataGridColumn<Event>[] = [
    {
      key: "event",
      header: "Event",
      kind: "row-header",
      cell: (event) => (
        <p className="truncate font-semibold text-foreground">{event.name}</p>
      ),
    },
    {
      key: "dates",
      header: "Dates",
      width: "13rem",
      cell: (event) => <span className="text-muted-foreground">{formatDates(event)}</span>,
    },
    {
      key: "status",
      header: "Status",
      width: "8rem",
      cell: (event) => (
        <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium capitalize text-foreground">
          {event.status}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      headerLabel: "Actions",
      width: "3rem",
      align: "right",
      cell: (event) =>
        manageableEventIds.has(event.id) ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Actions for ${event.name}`}
                onClick={(clickEvent) => clickEvent.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditor({ mode: "duplicate", source: event })}>
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
              </DropdownMenuItem>
              {event.status === "draft" && (
                <DropdownMenuItem className="text-destructive" onSelect={() => setDeleteCandidate(event)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null,
    },
  ];
  return (
    <AppLayout
      title="Events"
      detail={
        editor ? (
          editor.mode === "new" ? <EventCreationWizard events={events} onClose={closeEditor} onSaved={(_id, slug, formId) => navigate(formId ? `/events/${slug}/program/forms/${formId}/edit` : `/events/${slug}/dashboard`)} /> : <EventEditor editor={editor} events={events} onClose={closeEditor} onSaved={(_id, slug) => navigate(`/events/${slug}/dashboard`)} />
        ) : undefined
      }
    >
      <div className="space-y-5">
        <ContentToolbar
          ariaLabel="Event controls"
          utilities={
            <SegmentedControl<"all" | EventStatus>
              label="Event status"
              value={filter}
              options={[
                { value: "all", label: "All" },
                { value: "draft", label: "Draft" },
                { value: "published", label: "Published" },
                { value: "archived", label: "Archived" },
              ]}
              onChange={setFilter}
            />
          }
          primaryAction={
            <Button onClick={() => setEditor({ mode: "new" })}>
              New event
            </Button>
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
          <DataGrid
            rows={visible}
            columns={columns}
            empty="No events match this status."
            ariaLabel="Events"
            getRowLabel={(event) => event.name}
            onRowActivated={(event) => navigate(`/events/${event.slug}/dashboard`)}
            minWidth={680}
          />
        ) : (
          <div className={cardSurfaceClasses("default")}>
            <EmptyState
              icon={CalendarDays}
              title={events.length ? "No events match this status" : "Create your first event"}
              message={events.length ? "Choose another status to return to your event list." : "Set the dates, timezone, and call for papers so your team has a workspace to build the program."}
              action={events.length ? <Button variant="outline" onClick={() => setFilter("all")}>Show all events</Button> :
                <Button onClick={() => setEditor({ mode: "new" })}>
                  <CalendarDays className="mr-2 h-4 w-4" />
                  Create your first event
                </Button>
              }
            />
          </div>
        )}
        <AlertDialog open={Boolean(deleteCandidate)} onOpenChange={(open) => !open && closeDelete()}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {deleteCandidate?.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes the draft event and all of its program data. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
              <Label htmlFor="delete-event-confirmation">
                Type <span className="font-medium text-foreground">{deleteCandidate?.name}</span> to confirm
              </Label>
              <Input
                id="delete-event-confirmation"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                autoComplete="off"
                disabled={deleting}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Keep event</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/85"
                disabled={deleting || deleteConfirmation !== deleteCandidate?.name}
                onClick={(event) => {
                  event.preventDefault();
                  void removeEvent();
                }}
              >
                {deleting ? "Deleting…" : "Delete event"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
import { cardSurfaceClasses } from "@/components/ui/card";
