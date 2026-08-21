import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import Papa from "papaparse";
import { jsPDF } from "jspdf";
import {
  AlertTriangle,
  ArrowUpDown,
  CalendarDays,
  Clock3,
  Copy,
  Download,
  Filter,
  Info,
  MoreHorizontal,
  Printer,
  Search,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { DataGrid, type DataGridColumn } from "@/components/shared/DataGrid";
import { DetailPane } from "@/components/shared/DetailPane";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonList } from "@/components/shared/SkeletonList";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRepo } from "@/data/repo";
import type {
  AgendaConflict,
  Event,
  Room,
  Speaker,
  SpeakerId,
  Submission,
  Track,
} from "@/data/types";
import { toast } from "@/components/ui/sonner";
import { AgendaMoveControl } from "./AgendaMoveControl";
import {
  AgendaSessionForm,
  type AgendaSessionValue,
} from "./AgendaSessionForm";
import {
  eventDateTime,
  eventDateTimeToEpoch,
  utcCalendarDate,
} from "@/lib/event-time";

export type AgendaItem = {
  id: string;
  title: string;
  track: string;
  trackId?: string;
  roomId: string;
  room: string;
  speaker: string;
  speakerIds: string[];
  startTime: number;
  endTime: number;
  isPublished: boolean;
  submissionId?: string;
};
type AgendaDragItem = { kind: "session" | "submission"; id: string };

export function parseAgendaDragItem(payload: string): AgendaDragItem | undefined {
  const separator = payload.indexOf(":");
  if (separator < 1) return undefined;
  const kind = payload.slice(0, separator);
  const id = payload.slice(separator + 1);
  return (kind === "session" || kind === "submission") && id
    ? { kind, id }
    : undefined;
}
type AgendaView =
  "list" | "day" | "week" | "month" | "track" | "rooms" | "conflicts";
const agendaViews: { value: AgendaView; label: string }[] = [
  { value: "rooms", label: "Schedule Studio" },
  { value: "list", label: "Session list" },
  { value: "conflicts", label: "Conflicts" },
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "track", label: "Tracks" },
];
function parseAgendaView(value: string | null): AgendaView {
  return agendaViews.some((view) => view.value === value)
    ? (value as AgendaView)
    : "rooms";
}
type SortKey = "time" | "title" | "room";
type DetailMode = "create" | "duplicate" | undefined;
const fallbackTimezone = "America/New_York";

function formatTime(value: number, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function formatDay(
  date: string,
  timeZone: string,
  weekday: "long" | "short" = "short",
) {
  const value = eventDateTimeToEpoch(date, "12:00", timeZone);
  if (value === undefined) return date;
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday,
    month: "short",
    day: "numeric",
  }).format(value);
}

export function agendaDayGroups<T extends { startTime: number }>(
  items: T[],
  timeZone: string,
) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const date = eventDateTime(item.startTime, timeZone).date;
    groups.set(date, [...(groups.get(date) ?? []), item]);
  }
  return [...groups.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([date, dayItems]) => ({
      date,
      items: [...dayItems].sort(
        (first, second) => first.startTime - second.startTime,
      ),
    }));
}

export function agendaEventDays(startsAt: number, endsAt: number) {
  const first = utcCalendarDate(startsAt);
  const last = utcCalendarDate(endsAt);
  if (last < first) return [];
  const days: string[] = [];
  let cursor = Date.parse(`${first}T00:00:00Z`);
  const limit = Date.parse(`${last}T00:00:00Z`);
  while (cursor <= limit) {
    days.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 24 * 60 * 60_000;
  }
  return days;
}

export function agendaWeekGroups<T extends { startTime: number }>(
  items: T[],
  eventStartDate: number,
  eventEndDate: number,
  timeZone: string,
) {
  const grouped = new Map(
    agendaDayGroups(items, timeZone).map((group) => [group.date, group.items]),
  );
  return agendaEventDays(eventStartDate, eventEndDate).map((date) => ({
    date,
    items: grouped.get(date) ?? [],
  }));
}

export function agendaTrackGroups<
  T extends { track: string; startTime: number },
>(items: T[]) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const track = item.track || "Unassigned";
    groups.set(track, [...(groups.get(track) ?? []), item]);
  }
  return [...groups.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([track, trackItems]) => ({
      track,
      items: [...trackItems].sort(
        (first, second) => first.startTime - second.startTime,
      ),
    }));
}

export function snapToAgendaInterval(
  value: number,
  timeZone: string,
  intervalMinutes = 15,
) {
  const local = eventDateTime(value, timeZone);
  const [hour, minute] = local.time.split(":").map(Number);
  const snappedMinutes =
    Math.round((hour * 60 + minute) / intervalMinutes) * intervalMinutes;
  const dayOffset = Math.floor(snappedMinutes / (24 * 60));
  const minutesInDay = snappedMinutes % (24 * 60);
  const date = new Date(
    Date.parse(`${local.date}T00:00:00Z`) + dayOffset * 24 * 60 * 60_000,
  )
    .toISOString()
    .slice(0, 10);
  const snappedHour = String(Math.floor(minutesInDay / 60)).padStart(2, "0");
  const snappedMinute = String(minutesInDay % 60).padStart(2, "0");
  const time = `${snappedHour}:${snappedMinute}`;
  return eventDateTimeToEpoch(date, time, timeZone) ?? value;
}
function TimeInput({
  value,
  onCommit,
  label,
}: {
  value: string;
  onCommit: (value: string) => void;
  label: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  return (
    <Input
      aria-label={label}
      className="h-8 w-28"
      type="time"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
    />
  );
}
function conflictSummary(
  conflict: AgendaConflict,
  itemById: Map<string, AgendaItem>,
) {
  const first = itemById.get(conflict.itemA);
  const second = itemById.get(conflict.itemB);
  if (!first || !second) return null;
  if (conflict.reason === "room_overlap")
    return {
      id: `room-${conflict.itemA}-${conflict.itemB}`,
      blocking: true,
      title: "Room overlap",
      description: `${first.title} and ${second.title} are both scheduled in ${first.room}.`,
      first,
      second,
    };
  if (conflict.reason === "speaker_overlap")
    return {
      id: `speaker-${conflict.itemA}-${conflict.itemB}`,
      blocking: true,
      title: "Speaker double-booked",
      description: `${first.title} and ${second.title} share a speaker at the same time.`,
      first,
      second,
    };
  if (conflict.reason === "track_overlap")
    return {
      id: `track-${conflict.itemA}-${conflict.itemB}`,
      blocking: false,
      title: "Track overlap · Informational",
      description: `${first.title} and ${second.title} are both in ${first.track}. This does not block publishing.`,
      first,
      second,
    };
  return {
    id: `availability-${conflict.itemA}-${conflict.speakerId ?? "speaker"}`,
    blocking: false,
    title: "Speaker unavailable",
    description: `${first.speaker} is marked unavailable during ${first.title}.`,
    first,
    second,
  };
}

export default function Agenda() {
  const repo = useRepo();
  const { event: activeEvent } = useCurrentEvent();
  const navigate = useNavigate();
  const { agendaId } = useParams<{ agendaId?: string }>();
  const location = useLocation();
  const creating = agendaId === "new" || location.pathname.endsWith("/new");
  const [params, setParams] = useSearchParams();
  const [event, setEvent] = useState<Event>();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [conflictRecords, setConflictRecords] = useState<AgendaConflict[]>([]);
  // The active view lives in the URL so a room grid or a conflict list can be
  // linked to and survives a reload.
  const view = parseAgendaView(params.get("view"));
  const setView = useCallback(
    (next: AgendaView) => {
      setParams((current) => {
        const nextParams = new URLSearchParams(current);
        if (next === "rooms") nextParams.delete("view");
        else nextParams.set("view", next);
        return nextParams;
      });
    },
    [setParams],
  );
  const [activeDay, setActiveDay] = useState("");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("time");
  const [roomFilters, setRoomFilters] = useState<string[]>([]);
  const [trackFilters, setTrackFilters] = useState<string[]>([]);
  const [publicationFilter, setPublicationFilter] = useState<
    "all" | "published" | "draft"
  >("all");
  const [detailMode, setDetailMode] = useState<DetailMode>();
  const listPath = `/events/${activeEvent.slug}/program/agenda`;
  const requestedSubmissionId = params.get("submission") ?? undefined;
  const [announcement, setAnnouncement] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [showPublishConfirmation, setShowPublishConfirmation] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string>();
  const [pendingDelete, setPendingDelete] = useState<AgendaItem>();
  const [deleting, setDeleting] = useState(false);
  const [undo, setUndo] = useState<{ previous?: AgendaItem; createdId?: string; title: string }>();
  const selectSession = useCallback(
    (id: string) => {
      navigate(`${listPath}/${encodeURIComponent(id)}/edit`);
    },
    [listPath, navigate],
  );
  const timeZone = event?.timezone ?? fallbackTimezone;
  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const nextEvent = activeEvent;
      if (!nextEvent) {
        setEvent(undefined);
        setItems([]);
        setRooms([]);
        setConflictRecords([]);
        return;
      }
      const scope = { eventId: nextEvent.id };
      const [
        agenda,
        conflicts,
        nextRooms,
        nextTracks,
        nextSpeakers,
        nextSubmissions,
      ] = await Promise.all([
        repo.agenda.list(scope),
        repo.agenda.detectConflicts(scope),
        repo.events.listRooms(scope),
        repo.events.listTracks(scope),
        repo.speakers.list(scope),
        repo.submissions.list(scope),
      ]);
      const roomNames = new Map(nextRooms.map((room) => [room.id, room.name]));
      const trackNames = new Map(
        nextTracks.map((track) => [track.id, track.name]),
      );
      const speakerNames = new Map(
        nextSpeakers.map((speaker) => [speaker.id, speaker.name]),
      );
      setEvent(nextEvent);
      setRooms(nextRooms);
      setTracks(nextTracks);
      setSpeakers(nextSpeakers);
      setSubmissions(nextSubmissions);
      setConflictRecords(conflicts);
      setItems(
        agenda.map((item) => ({
          id: item.id,
          title: item.title,
          trackId: item.trackId,
          track: item.trackId
            ? (trackNames.get(item.trackId) ?? "Unassigned")
            : "Unassigned",
          roomId: item.roomId,
          room: roomNames.get(item.roomId) ?? "Unknown room",
          speakerIds: item.speakerIds,
          speaker:
            item.speakerIds
              .map((id) => speakerNames.get(id) ?? "Unknown speaker")
              .join(", ") || "Unassigned",
          startTime: item.startTime,
          endTime: item.endTime,
          isPublished: item.isPublished,
          submissionId: item.submissionId,
        })),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load the agenda.",
      );
      setItems([]);
      setConflictRecords([]);
    } finally {
      setLoading(false);
    }
  }, [activeEvent, repo]);
  useEffect(() => {
    void load();
  }, [load]);
  const visibleItems = useMemo(() => {
    const filtered = items.filter(
      (item) =>
        `${item.title} ${item.speaker} ${item.track} ${item.room}`
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (roomFilters.length === 0 || roomFilters.includes(item.roomId)) &&
        (trackFilters.length === 0 ||
          Boolean(item.trackId && trackFilters.includes(item.trackId))) &&
        (publicationFilter === "all" ||
          item.isPublished === (publicationFilter === "published")),
    );
    return [...filtered].sort((first, second) =>
      sortKey === "time"
        ? first.startTime - second.startTime
        : sortKey === "title"
          ? first.title.localeCompare(second.title)
          : first.room.localeCompare(second.room),
    );
  }, [items, publicationFilter, query, roomFilters, sortKey, trackFilters]);
  const dayGroups = useMemo(
    () => agendaDayGroups(items, timeZone),
    [items, timeZone],
  );
  const trackGroups = useMemo(() => agendaTrackGroups(items), [items]);
  useEffect(() => {
    if (!dayGroups.some((group) => group.date === activeDay)) {
      setActiveDay(dayGroups[0]?.date ?? "");
    }
  }, [activeDay, dayGroups]);
  const itemById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );
  const conflicts = useMemo(
    () =>
      conflictRecords
        .map((conflict) => conflictSummary(conflict, itemById))
        .filter((conflict): conflict is NonNullable<typeof conflict> =>
          Boolean(conflict),
        ),
    [conflictRecords, itemById],
  );
  const blockingConflicts = useMemo(
    () => conflicts.filter((conflict) => conflict.blocking),
    [conflicts],
  );
  const blockingByItem = useMemo(() => {
    const byItem = new Map<string, string[]>();
    for (const conflict of blockingConflicts)
      for (const item of [conflict.first, conflict.second])
        byItem.set(item.id, [...(byItem.get(item.id) ?? []), conflict.title]);
    return byItem;
  }, [blockingConflicts]);
  const selectedId = agendaId && agendaId !== "new" ? agendaId : params.get("selected");
  const selectedItem = selectedId
    ? itemById.get(selectedId)
    : undefined;
  const requestedSubmission = submissions.find(
    (submission) => submission.id === requestedSubmissionId,
  );
  useEffect(() => {
    if (agendaId || params.get("mode") !== "add") return;
    const suffix = requestedSubmissionId ? `?submission=${encodeURIComponent(requestedSubmissionId)}` : "";
    navigate(`${listPath}/new${suffix}`, { replace: true });
  }, [agendaId, listPath, navigate, params, requestedSubmissionId]);
  const closeDetail = () => {
    if (agendaId || creating) { navigate(listPath); return; }
    setDetailMode(undefined);
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("selected");
      next.delete("submission");
      next.delete("mode");
      return next;
    });
  };
  const persist = async (item: AgendaItem) => {
    if (!event) return;
    await repo.agenda.save({
      id: item.id,
      eventId: event.id,
      title: item.title,
      roomId: item.roomId,
      trackId: item.trackId,
      submissionId: item.submissionId,
      speakerIds: item.speakerIds as never,
      startTime: item.startTime,
      endTime: item.endTime,
      isPublished: item.isPublished,
    });
  };
  const saveSession = async (value: AgendaSessionValue) => {
    if (!event) return;
    await repo.agenda.save({
      ...value,
      eventId: event.id,
      speakerIds: value.speakerIds as SpeakerId[],
    });
    await load();
    closeDetail();
    toast.success(value.id ? "Session updated" : "Session created");
  };
  const updateRoom = async (id: string, roomId: string) => {
    const room = rooms.find((candidate) => candidate.id === roomId);
    const current = items.find((item) => item.id === id);
    if (!room || !current) return;
    const next = { ...current, roomId, room: room.name };
    setItems((previous) =>
      previous.map((item) => (item.id === id ? next : item)),
    );
    try {
      await persist(next);
      await load();
      toast.success("Room assignment saved");
    } catch (cause) {
      setItems((previous) =>
        previous.map((item) => (item.id === id ? current : item)),
      );
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save the room assignment.",
      );
      toast.error("Room assignment could not be saved");
    }
  };
  const updateTime = async (
    id: string,
    boundary: "start" | "end",
    time: string,
  ) => {
    const current = items.find((item) => item.id === id);
    if (!current) return;
    const currentBoundary =
      boundary === "start" ? current.startTime : current.endTime;
    const date = eventDateTime(currentBoundary, timeZone).date;
    const timestamp = eventDateTimeToEpoch(date, time, timeZone);
    if (timestamp === undefined) {
      setError(`“${time}” is not a valid ${timeZone} time on ${date}.`);
      return;
    }
    const next =
      boundary === "start"
        ? { ...current, startTime: timestamp }
        : { ...current, endTime: timestamp };
    if (next.startTime >= next.endTime) {
      setError("A session must end after it starts.");
      return;
    }
    setItems((previous) =>
      previous.map((item) => (item.id === id ? next : item)),
    );
    try {
      await persist(next);
      await load();
      toast.success("Session time saved");
    } catch (cause) {
      setItems((previous) =>
        previous.map((item) => (item.id === id ? current : item)),
      );
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save the session time.",
      );
      toast.error("Session time could not be saved");
    }
  };
  const moveSession = async (
    id: string,
    roomId: string,
    targetStartTime: number,
  ) => {
    if (!event) return;
    const room = rooms.find((candidate) => candidate.id === roomId);
    const current = items.find((item) => item.id === id);
    if (!room || !current) return;
    const startTime = snapToAgendaInterval(targetStartTime, timeZone);
    const next = {
      ...current,
      roomId,
      room: room.name,
      startTime,
      endTime: startTime + (current.endTime - current.startTime),
    };
    if (
      next.roomId === current.roomId &&
      next.startTime === current.startTime
    ) {
      return;
    }
    setError(undefined);
    setAnnouncement(`Moving ${current.title}.`);
    setItems((previous) =>
      previous.map((item) => (item.id === id ? next : item)),
    );
    try {
      await persist(next);
      const conflictsAfterMove = await repo.agenda.detectConflicts({
        eventId: event.id,
      });
      setConflictRecords(conflictsAfterMove);
      const message = `${next.title} moved to ${next.room} at ${formatTime(next.startTime, timeZone)}.`;
      setAnnouncement(message);
      toast.success("Session moved", { description: message });
      setUndo({ previous: current, title: next.title });
    } catch (cause) {
      setItems((previous) =>
        previous.map((item) => (item.id === id ? current : item)),
      );
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not move the session. Its previous room and time were restored.",
      );
      const message =
        cause instanceof Error
          ? cause.message
          : "Could not move the session. Its previous room and time were restored.";
      setAnnouncement(message);
      toast.error("Move failed", { description: message });
      throw cause;
    }
  };
  const scheduleSubmission = async (submission: Submission, roomId: string, startTime: number) => {
    if (!event) return;
    const endTime = startTime + 45 * 60_000;
    const input = {
      eventId: event.id,
      title: submission.title ?? "Untitled accepted session",
      roomId,
      trackId: submission.trackId,
      submissionId: submission.id,
      speakerIds: submission.speakerIds as SpeakerId[],
      startTime,
      endTime,
      isPublished: false,
    };
    const conflicts = await repo.agenda.checkPlacement(input);
    const blocking = conflicts.find((conflict) => conflict.blocking);
    if (blocking) throw new Error(blocking.message);
    const id = await repo.agenda.save(input);
    setUndo({ createdId: id, title: input.title });
    await load();
    toast.success("Session scheduled", { description: `${input.title} was added to the schedule.` });
  };
  const undoLastPlacement = async () => {
    if (!event || !undo) return;
    if (undo.createdId) await repo.agenda.remove({ eventId: event.id, id: undo.createdId });
    else if (undo.previous) await persist(undo.previous);
    await load();
    toast.success("Schedule change undone", { description: `${undo.title} was restored.` });
    setUndo(undefined);
  };
  const deleteSession = async () => {
    if (!event || !pendingDelete) return;
    setDeleting(true);
    try {
      await repo.agenda.remove({ eventId: event.id, id: pendingDelete.id });
      setPendingDelete(undefined);
      closeDetail();
      await load();
      toast.success("Session deleted");
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Could not delete the session.";
      setError(message);
      toast.error("Delete failed", { description: message });
    } finally {
      setDeleting(false);
    }
  };
  const publishSchedule = async () => {
    if (!event) return;
    setPublishing(true);
    setPublishError(undefined);
    try {
      await repo.agenda.publishSchedule(event.id);
      await load();
      setShowPublishConfirmation(false);
    } catch (cause) {
      setPublishError(
        cause instanceof Error
          ? cause.message
          : "Could not publish the schedule.",
      );
    } finally {
      setPublishing(false);
    }
  };
  const exportRows = visibleItems.map((item) => ({
    Date: eventDateTime(item.startTime, timeZone).date,
    Start: eventDateTime(item.startTime, timeZone).time,
    End: eventDateTime(item.endTime, timeZone).time,
    Session: item.title,
    Speakers: item.speaker,
    Track: item.track,
    Room: item.room,
    Status: item.isPublished ? "Published" : "Draft",
  }));
  const downloadBlob = (contents: BlobPart, type: string, name: string) => {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  };
  const exportCsv = () => {
    downloadBlob(
      Papa.unparse(exportRows),
      "text/csv;charset=utf-8",
      "agenda.csv",
    );
    toast.success("Agenda CSV exported");
  };
  const exportPdf = () => {
    const pdf = new jsPDF();
    pdf.setFontSize(16);
    pdf.text(event?.name ? `${event.name} schedule` : "Schedule", 14, 18);
    pdf.setFontSize(9);
    let y = 28;
    for (const row of exportRows) {
      const lines = pdf.splitTextToSize(
        `${row.Date} ${row.Start}–${row.End}  ${row.Session} — ${row.Speakers} · ${row.Room}`,
        180,
      );
      if (y + lines.length * 5 > 285) {
        pdf.addPage();
        y = 18;
      }
      pdf.text(lines, 14, y);
      y += lines.length * 5 + 2;
    }
    pdf.save("agenda.pdf");
    toast.success("Agenda PDF exported");
  };
  const duplicateDay = async (sourceDate: string, targetDate: string) => {
    if (!event || sourceDate === targetDate)
      throw new Error("Choose two different event days.");
    const sourceItems = items.filter(
      (item) => eventDateTime(item.startTime, timeZone).date === sourceDate,
    );
    if (sourceItems.length === 0)
      throw new Error("The source day has no sessions to duplicate.");
    await Promise.all(
      sourceItems.map((item) => {
        const localStart = eventDateTime(item.startTime, timeZone);
        const localEnd = eventDateTime(item.endTime, timeZone);
        const startTime = eventDateTimeToEpoch(
          targetDate,
          localStart.time,
          timeZone,
        );
        const endTime = eventDateTimeToEpoch(
          targetDate,
          localEnd.time,
          timeZone,
        );
        if (startTime === undefined || endTime === undefined)
          throw new Error("Could not map a session into the target day.");
        return repo.agenda.save({
          eventId: event.id,
          title: item.title,
          roomId: item.roomId,
          trackId: item.trackId,
          submissionId: item.submissionId,
          speakerIds: item.speakerIds as SpeakerId[],
          startTime,
          endTime,
          isPublished: false,
        });
      }),
    );
    await load();
    closeDetail();
    toast.success(
      `${sourceItems.length} ${sourceItems.length === 1 ? "session" : "sessions"} duplicated as drafts`,
    );
  };
  const columns: DataGridColumn<AgendaItem>[] = [
    {
      key: "time",
      header: "Time",
      cell: (item) => (
        <div className="flex flex-wrap items-center gap-2">
          <TimeInput
            label={`Start time for ${item.title}`}
            value={eventDateTime(item.startTime, timeZone).time}
            onCommit={(time) => void updateTime(item.id, "start", time)}
          />
          <span className="text-muted-foreground">to</span>
          <TimeInput
            label={`End time for ${item.title}`}
            value={eventDateTime(item.endTime, timeZone).time}
            onCommit={(time) => void updateTime(item.id, "end", time)}
          />
        </div>
      ),
    },
    {
      key: "title",
      header: "Session",
      cell: (item) => {
        const itemConflicts = blockingByItem.get(item.id) ?? [];
        return (
          <div>
            <p className="font-medium">{item.title}</p>
            <p className="text-xs text-muted-foreground">{item.track}</p>
            {itemConflicts.length > 0 && (
              <p className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200">
                <AlertTriangle
                  className="h-3 w-3 shrink-0"
                  aria-hidden="true"
                />
                {[...new Set(itemConflicts)].join(" · ")}
              </p>
            )}
          </div>
        );
      },
    },
    { key: "speaker", header: "Speaker", cell: (item) => item.speaker },
    {
      key: "room",
      header: "Room",
      cell: (item) => (
        <Select
          value={item.roomId}
          onValueChange={(roomId) => void updateRoom(item.id, roomId)}
        >
          <SelectTrigger className="h-8 w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {rooms.map((room) => (
              <SelectItem key={room.id} value={room.id}>
                {room.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      key: "move",
      header: "",
      align: "right",
      cell: (item) => (
        <AgendaMoveControl
          id={item.id}
          title={item.title}
          roomId={item.roomId}
          startTime={item.startTime}
          rooms={rooms}
          timeZone={timeZone}
          onMove={moveSession}
        />
      ),
    },
  ];
  const primaryEditor =
    event && creating ? (
        <AgendaSessionForm
          event={event}
          rooms={rooms}
          tracks={tracks}
          speakers={speakers}
          submissions={submissions}
          initial={
            requestedSubmission
              ? {
                  title:
                    requestedSubmission.title ?? "Untitled accepted submission",
                  submissionId: requestedSubmission.id,
                  speakerIds: requestedSubmission.speakerIds,
                  trackId: requestedSubmission.trackId,
                  roomId: rooms[0]?.id ?? "",
                  startTime: event.startDate + 9 * 60 * 60_000,
                  endTime: event.startDate + 9 * 60 * 60_000 + 45 * 60_000,
                  isPublished: false,
                }
              : undefined
          }
          onSave={saveSession}
          onCancel={closeDetail}
        />
    ) : event && detailMode === "duplicate" ? (
      <DetailPane title="Duplicate day" onClose={closeDetail}>
        <DuplicateDayForm
          days={agendaEventDays(event.startDate, event.endDate)}
          timeZone={timeZone}
          onDuplicate={duplicateDay}
          onCancel={closeDetail}
        />
      </DetailPane>
    ) : event && selectedItem ? (
        <AgendaSessionForm
          event={event}
          rooms={rooms}
          tracks={tracks}
          speakers={speakers}
          submissions={submissions}
          initial={{
            id: selectedItem.id,
            title: selectedItem.title,
            submissionId: selectedItem.submissionId,
            speakerIds: selectedItem.speakerIds,
            trackId: selectedItem.trackId,
            roomId: selectedItem.roomId,
            startTime: selectedItem.startTime,
            endTime: selectedItem.endTime,
            isPublished: selectedItem.isPublished,
          }}
          onSave={saveSession}
          onCancel={closeDetail}
          onDelete={() => setPendingDelete(selectedItem)}
        />
    ) : undefined;
  if (agendaId || creating) {
    return (
      <AppLayout title={creating ? "New session" : selectedItem?.title ?? "Session"}>
        {loading ? <SkeletonList rows={4} label="Loading session…" /> : primaryEditor ?? <EmptyState title="Session not found" message="This session may have been removed." action={<Button variant="outline" onClick={closeDetail}>Back to schedule</Button>} />}
      </AppLayout>
    );
  }
  const detail = detailMode === "duplicate" ? primaryEditor : undefined;
  return (
    <AppLayout title="Schedule" detail={detail}>
      <div className="space-y-5">
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <ContentToolbar
          ariaLabel="Agenda controls"
          search={
            <div className="relative min-w-0">
              <Label className="sr-only" htmlFor="agenda-search">
                Search schedule
              </Label>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="agenda-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-8 pl-9"
                placeholder="Search schedule"
              />
            </div>
          }
          utilities={
            <>
              <Select value={view} onValueChange={(value) => setView(value as AgendaView)}>
                <SelectTrigger className="h-8 w-40" aria-label="Schedule view"><SelectValue /></SelectTrigger>
                <SelectContent>{agendaViews.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}{option.value === "conflicts" && blockingConflicts.length ? ` (${blockingConflicts.length})` : ""}</SelectItem>)}</SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!event || publishing}
                onClick={() => {
                  setShowPublishConfirmation(true);
                  setPublishError(undefined);
                }}
              >
                {publishing ? "Publishing…" : "Publish schedule"}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <ArrowUpDown className="mr-1 h-4 w-4" />
                    Sort
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuRadioGroup
                    value={sortKey}
                    onValueChange={(value) => setSortKey(value as SortKey)}
                  >
                    <DropdownMenuRadioItem value="time">
                      Time
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="title">
                      Title
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="room">
                      Room
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Filter className="mr-1 h-4 w-4" />
                    Filter
                    {roomFilters.length +
                      trackFilters.length +
                      (publicationFilter === "all" ? 0 : 1) >
                    0
                      ? ` (${roomFilters.length + trackFilters.length + (publicationFilter === "all" ? 0 : 1)})`
                      : ""}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
                    Rooms
                  </p>
                  {rooms.map((room) => (
                    <DropdownMenuCheckboxItem
                      key={room.id}
                      checked={roomFilters.includes(room.id)}
                      onCheckedChange={(checked) =>
                        setRoomFilters((current) =>
                          checked
                            ? [...current, room.id]
                            : current.filter((id) => id !== room.id),
                        )
                      }
                    >
                      {room.name}
                    </DropdownMenuCheckboxItem>
                  ))}
                  <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
                    Tracks
                  </p>
                  {tracks.map((track) => (
                    <DropdownMenuCheckboxItem
                      key={track.id}
                      checked={trackFilters.includes(track.id)}
                      onCheckedChange={(checked) =>
                        setTrackFilters((current) =>
                          checked
                            ? [...current, track.id]
                            : current.filter((id) => id !== track.id),
                        )
                      }
                    >
                      {track.name}
                    </DropdownMenuCheckboxItem>
                  ))}
                  <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
                    Status
                  </p>
                  <DropdownMenuRadioGroup
                    value={publicationFilter}
                    onValueChange={(value) =>
                      setPublicationFilter(value as typeof publicationFilter)
                    }
                  >
                    <DropdownMenuRadioItem value="all">
                      All
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="published">
                      Published
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="draft">
                      Draft
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="More agenda options"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={exportCsv}>
                    <Download className="mr-2 h-4 w-4" />
                    Export as CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={exportPdf}>
                    <Download className="mr-2 h-4 w-4" />
                    Export as PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => window.print()}>
                    <Printer className="mr-2 h-4 w-4" />
                    Print schedule
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      setDetailMode("duplicate");
                      setParams((current) => {
                        const next = new URLSearchParams(current);
                        next.delete("selected");
                        return next;
                      });
                    }}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Duplicate day…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          }
          primaryAction={
            <Button
              type="button"
              variant="accent"
              size="sm"
              title={
                event && !rooms.length
                  ? "Add a room in Event settings before scheduling sessions."
                  : undefined
              }
              onClick={() => navigate(`${listPath}/new`)}
              disabled={!event || !rooms.length}
            >
              Add session
            </Button>
          }
        />
        {event && !rooms.length && (
          <section
            className={cardSurfaceClasses(
              "default",
              "flex flex-wrap items-center gap-x-2 gap-y-1 bg-muted p-4 text-sm",
            )}
          >
            <Info
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span>
              Sessions need somewhere to happen. Add at least one room before
              scheduling.
            </span>
            <Link
              to={`/events/${event.slug}/settings/event`}
              className="font-medium underline underline-offset-4"
            >
              Add rooms in Event settings
            </Link>
          </section>
        )}
        {view !== "conflicts" && blockingConflicts.length > 0 && (
          <section
            aria-label="Scheduling conflicts"
            className={cardSurfaceClasses(
              "default",
              "flex flex-wrap items-center gap-x-3 gap-y-2 bg-amber-500/10 p-4 text-sm",
            )}
          >
            <AlertTriangle
              className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300"
              aria-hidden="true"
            />
            <span>
              {blockingConflicts.length}{" "}
              {blockingConflicts.length === 1
                ? "session conflict"
                : "session conflicts"}{" "}
              — two sessions share a room or a speaker at the same time. This
              blocks publishing.
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => setView("conflicts")}
            >
              Review conflicts
            </Button>
          </section>
        )}
        {showPublishConfirmation && (
          <section
            aria-label="Publish schedule confirmation"
            className={cardSurfaceClasses("default", "bg-muted p-4")}
          >
            <p className="font-medium">
              {blockingConflicts.length > 0
                ? "Resolve the scheduling conflicts first"
                : "Publish the current schedule?"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {blockingConflicts.length > 0
                ? `${blockingConflicts.length} ${blockingConflicts.length === 1 ? "session shares" : "sessions share"} a room or a speaker with another session at the same time. Fix those before speakers see the schedule.`
                : "Every scheduled session will become visible on the attendee site and in assigned speaker schedules."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {blockingConflicts.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowPublishConfirmation(false);
                    setView("conflicts");
                  }}
                >
                  Review conflicts
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={publishing}
                  onClick={() => void publishSchedule()}
                >
                  {publishing ? "Publishing…" : "Confirm publish"}
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={publishing}
                onClick={() => {
                  setShowPublishConfirmation(false);
                  setPublishError(undefined);
                }}
              >
                Cancel
              </Button>
            </div>
            {publishError && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {publishError}
              </p>
            )}
          </section>
        )}
        {loading ? (
          <SkeletonList rows={4} label="Loading agenda…" />
        ) : view === "list" ? (
          <section className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <CalendarDays className="mr-1 inline h-4 w-4" />
              Times shown in the event timezone
            </p>
            <DataGrid
              rows={visibleItems}
              columns={columns}
              empty="Nothing here yet — sessions will appear here in list view."
              paginated
              getRowLabel={(item) => item.title}
              onRowActivated={(item) => selectSession(item.id)}
            />
          </section>
        ) : view === "rooms" && event ? (
          <RoomsView
            items={visibleItems}
            rooms={rooms}
            event={event}
            timeZone={timeZone}
            onMove={moveSession}
            submissions={submissions}
            onSchedule={scheduleSubmission}
            undoLabel={undo?.title}
            onUndo={() => void undoLastPlacement()}
          />
        ) : view === "day" ? (
          <DayView
            items={visibleItems}
            sessionDays={dayGroups.map((group) => group.date)}
            activeDay={activeDay}
            onDayChange={setActiveDay}
            timeZone={timeZone}
          />
        ) : view === "week" && event ? (
          <WeekView items={visibleItems} event={event} timeZone={timeZone} />
        ) : view === "month" && event ? (
          <MonthView
            items={visibleItems}
            event={event}
            timeZone={timeZone}
            onSelectDay={(date) => {
              setActiveDay(date);
              setView("day");
            }}
          />
        ) : view === "track" ? (
          <TrackView items={visibleItems} timeZone={timeZone} />
        ) : (
          <ConflictsView
            conflicts={conflicts}
            timeZone={timeZone}
            onSelectSession={selectSession}
          />
        )}
        <AlertDialog
          open={pendingDelete !== undefined}
          onOpenChange={(open) => !open && setPendingDelete(undefined)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete “{pendingDelete?.title}”?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This removes the session from the schedule. Its submission and
                speakers are not affected, and it can be scheduled again later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                className={buttonVariants({ variant: "ghost" })}
                disabled={deleting}
              >
                Keep session
              </AlertDialogCancel>
              <AlertDialogAction
                className={buttonVariants({ variant: "destructive" })}
                disabled={deleting}
                onClick={(clickEvent) => {
                  clickEvent.preventDefault();
                  void deleteSession();
                }}
              >
                {deleting ? "Deleting…" : "Delete session"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}

function DayView({
  items,
  sessionDays,
  activeDay,
  onDayChange,
  timeZone,
}: {
  items: AgendaItem[];
  sessionDays: string[];
  activeDay: string;
  onDayChange: (date: string) => void;
  timeZone: string;
}) {
  const activeItems =
    agendaDayGroups(items, timeZone).find((group) => group.date === activeDay)
      ?.items ?? [];
  if (sessionDays.length === 0) {
    return <EmptyAgenda message="No scheduled session days yet." />;
  }
  return (
    <section className="space-y-4">
      <div
        className={cardSurfaceClasses(
          "default",
          "flex items-center gap-4 bg-muted/40 p-4",
        )}
      >
        <Label htmlFor="agenda-day" className="text-sm font-medium">
          Event day
        </Label>
        <Select value={activeDay} onValueChange={onDayChange}>
          <SelectTrigger id="agenda-day" className="h-8 w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sessionDays.map((date) => (
              <SelectItem key={date} value={date}>
                {formatDay(date, timeZone, "long")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {activeItems.length === 0 ? (
        <EmptyAgenda message="No sessions match this day and search." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {activeItems.map((item) => (
            <AgendaSessionCard key={item.id} item={item} timeZone={timeZone} />
          ))}
        </div>
      )}
    </section>
  );
}

function WeekView({
  items,
  event,
  timeZone,
}: {
  items: AgendaItem[];
  event: Event;
  timeZone: string;
}) {
  const days = agendaWeekGroups(
    items,
    event.startDate,
    event.endDate,
    timeZone,
  );
  if (days.length === 0) {
    return (
      <EmptyAgenda message="The event does not have a valid date range." />
    );
  }
  return (
    <section className={cardSurfaceClasses("default", "overflow-x-auto p-3")}>
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: `repeat(${days.length}, minmax(220px, 1fr))`,
          minWidth: `${days.length * 220}px`,
        }}
      >
        {days.map((day, index) => (
          <section
            key={day.date}
            className={
              index % 2 === 0
                ? cardSurfaceClasses("default", "space-y-3 bg-muted/35 p-3")
                : cardSurfaceClasses("default", "space-y-3 bg-muted/15 p-3")
            }
          >
            <div>
              <h2 className="text-sm font-semibold">
                {formatDay(day.date, timeZone, "long")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {day.items.length}{" "}
                {day.items.length === 1 ? "session" : "sessions"}
              </p>
            </div>
            {day.items.length === 0 ? (
              <p className="rounded-md bg-card/70 p-3 text-sm text-muted-foreground">
                No sessions
              </p>
            ) : (
              day.items.map((item) => (
                <AgendaSessionCard
                  key={item.id}
                  item={item}
                  timeZone={timeZone}
                  compact
                />
              ))
            )}
          </section>
        ))}
      </div>
    </section>
  );
}

/** Sunday-anchored grid of whole weeks covering `monthKey` ("YYYY-MM"). */
export function agendaMonthGrid(monthKey: string) {
  const firstOfMonth = Date.parse(`${monthKey}-01T00:00:00Z`);
  if (Number.isNaN(firstOfMonth)) return [];
  const gridStart =
    firstOfMonth - new Date(firstOfMonth).getUTCDay() * 86_400_000;
  const cells: { date: string; inMonth: boolean }[] = [];
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(gridStart + index * 86_400_000)
      .toISOString()
      .slice(0, 10);
    cells.push({ date, inMonth: date.slice(0, 7) === monthKey });
    // Stop at the end of the week that contains the last day of the month.
    if (index % 7 === 6 && date.slice(0, 7) > monthKey) break;
  }
  return cells;
}

function MonthView({
  items,
  event,
  timeZone,
  onSelectDay,
}: {
  items: AgendaItem[];
  event: Event;
  timeZone: string;
  onSelectDay: (date: string) => void;
}) {
  const eventDays = agendaEventDays(event.startDate, event.endDate);
  const months = useMemo(
    () => [...new Set(eventDays.map((date) => date.slice(0, 7)))],
    [eventDays],
  );
  const [month, setMonth] = useState(months[0] ?? "");
  useEffect(() => {
    if (months.length && !months.includes(month)) setMonth(months[0]);
  }, [month, months]);
  const countsByDate = useMemo(() => {
    const counts = new Map<string, AgendaItem[]>();
    for (const group of agendaDayGroups(items, timeZone))
      counts.set(group.date, group.items);
    return counts;
  }, [items, timeZone]);
  const eventDaySet = useMemo(() => new Set(eventDays), [eventDays]);
  const cells = agendaMonthGrid(month);
  if (cells.length === 0)
    return (
      <EmptyAgenda message="The event does not have a valid date range." />
    );
  const monthLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(Date.parse(`${month}-01T00:00:00Z`));
  return (
    <section className="space-y-3">
      <div
        className={cardSurfaceClasses(
          "default",
          "flex flex-wrap items-center gap-3 bg-muted/40 p-3",
        )}
      >
        <Label htmlFor="agenda-month" className="text-sm font-medium">
          Month
        </Label>
        {months.length > 1 ? (
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger id="agenda-month" className="h-8 w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((value) => (
                <SelectItem key={value} value={value}>
                  {new Intl.DateTimeFormat("en-US", {
                    timeZone: "UTC",
                    month: "long",
                    year: "numeric",
                  }).format(Date.parse(`${value}-01T00:00:00Z`))}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-sm">{monthLabel}</span>
        )}
        <p className="text-xs text-muted-foreground">
          Select a day to open it in day view.
        </p>
      </div>
      <div className={cardSurfaceClasses("default", "overflow-x-auto p-3")}>
        <div className="grid min-w-[640px] grid-cols-7 gap-1">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday) => (
            <div
              key={weekday}
              className="px-2 py-1 text-xs font-medium text-muted-foreground"
            >
              {weekday}
            </div>
          ))}
          {cells.map((cell) => {
            const dayItems = countsByDate.get(cell.date) ?? [];
            const isEventDay = eventDaySet.has(cell.date);
            return (
              <button
                key={cell.date}
                type="button"
                disabled={!isEventDay}
                onClick={() => onSelectDay(cell.date)}
                aria-label={`${formatDay(cell.date, timeZone, "long")}, ${dayItems.length} ${dayItems.length === 1 ? "session" : "sessions"}`}
                className={`min-h-24 rounded-md p-2 text-left align-top transition-colors ${
                  isEventDay
                    ? "bg-muted/40 hover:bg-muted/70"
                    : "bg-muted/10 text-muted-foreground/50"
                } ${cell.inMonth ? "" : "opacity-50"} disabled:cursor-default disabled:hover:bg-muted/10`}
              >
                <span className="text-xs font-medium tabular-nums">
                  {Number(cell.date.slice(8, 10))}
                </span>
                {dayItems.length > 0 && (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {dayItems.length}{" "}
                    {dayItems.length === 1 ? "session" : "sessions"}
                  </span>
                )}
                <span className="mt-1 block space-y-0.5">
                  {dayItems.slice(0, 2).map((item) => (
                    <span
                      key={item.id}
                      className="block truncate rounded-sm bg-primary/10 px-1.5 py-0.5 text-xs"
                    >
                      {formatTime(item.startTime, timeZone)} {item.title}
                    </span>
                  ))}
                  {dayItems.length > 2 && (
                    <span className="block px-1.5 text-xs text-muted-foreground">
                      +{dayItems.length - 2} more
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function TrackView({
  items,
  timeZone,
}: {
  items: AgendaItem[];
  timeZone: string;
}) {
  const groups = agendaTrackGroups(items);
  if (groups.length === 0) {
    return <EmptyAgenda message="No sessions match this track view." />;
  }
  return (
    <section className="space-y-4">
      {groups.map((group, index) => (
        <section
          key={group.track}
          className={
            index % 2 === 0
              ? cardSurfaceClasses("default", "space-y-3 bg-muted/35 p-4")
              : cardSurfaceClasses("default", "space-y-3 bg-muted/15 p-4")
          }
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">{group.track}</h2>
            <span className="rounded-full bg-card px-2.5 py-1 text-xs text-muted-foreground">
              {group.items.length}{" "}
              {group.items.length === 1 ? "session" : "sessions"}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {group.items.map((item) => (
              <AgendaSessionCard
                key={item.id}
                item={item}
                timeZone={timeZone}
              />
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}

function RoomsView({
  items,
  rooms,
  event,
  timeZone,
  onMove,
  submissions,
  onSchedule,
  undoLabel,
  onUndo,
}: {
  items: AgendaItem[];
  rooms: Room[];
  event: Event;
  timeZone: string;
  onMove: (id: string, roomId: string, startTime: number) => Promise<void>;
  submissions: Submission[];
  onSchedule: (submission: Submission, roomId: string, startTime: number) => Promise<void>;
  undoLabel?: string;
  onUndo: () => void;
}) {
  const days = agendaEventDays(event.startDate, event.endDate);
  const [roomDay, setRoomDay] = useState(days[0] ?? "");
  const [dragged, setDragged] = useState<AgendaDragItem>();
  const [dragTarget, setDragTarget] = useState<string>();
  const dayItems = items.filter(
    (item) => eventDateTime(item.startTime, timeZone).date === roomDay,
  );
  const slots = agendaRoomSlots(roomDay, dayItems, timeZone, event.scheduleStartTime, event.scheduleEndTime);
  const unscheduled = submissions.filter((submission) =>
    submission.status === "accepted" && !items.some((item) => item.submissionId === submission.id),
  );
  const targetBlocked = (roomId: string, startTime: number, current = dragged) => {
    const source = current?.kind === "session"
      ? items.find((item) => item.id === current.id)
      : undefined;
    const sourceSubmission = current?.kind === "submission"
      ? unscheduled.find((submission) => submission.id === current.id)
      : undefined;
    const speakerIds = source?.speakerIds ?? sourceSubmission?.speakerIds ?? [];
    const duration = source ? source.endTime - source.startTime : 45 * 60_000;
    const endTime = startTime + duration;
    return items.some((item) => item.id !== source?.id && item.startTime < endTime && startTime < item.endTime
      && (item.roomId === roomId || item.speakerIds.some((id) => speakerIds.includes(id))));
  };
  const place = async (roomId: string, startTime: number, current = dragged) => {
    if (!current) return;
    if (targetBlocked(roomId, startTime, current)) {
      toast.error("That slot is unavailable", { description: "A room or speaker is already booked at that time." });
      return;
    }
    setDragged(undefined);
    setDragTarget(undefined);
    try {
      if (current.kind === "session") await onMove(current.id, roomId, startTime);
      else {
        const submission = unscheduled.find((candidate) => candidate.id === current.id);
        if (submission) await onSchedule(submission, roomId, startTime);
      }
    } catch (cause) {
      toast.error("Session could not be scheduled", {
        description: cause instanceof Error ? cause.message : "The schedule was not changed.",
      });
    }
  };
  if (rooms.length === 0 || days.length === 0)
    return (
      <EmptyAgenda message="Add rooms and an event date range to build the room grid." />
    );
  return (
    <section className="space-y-4" aria-label="Schedule Studio">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
        <Label className="text-sm text-muted-foreground">Event day</Label>
        <Select value={roomDay} onValueChange={setRoomDay}>
          <SelectTrigger className="h-8 w-full bg-muted/50 sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {days.map((day) => (
              <SelectItem key={day} value={day}>
                {formatDay(day, timeZone, "long")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Drag, or press Enter to lift a session and Enter again to place it.
        </p>
        </div>
        {undoLabel && <Button variant="outline" size="sm" onClick={onUndo}>Undo {undoLabel}</Button>}
      </div>
      <div className="grid gap-4 xl:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="rounded-md bg-muted/50 p-3" aria-label="Accepted sessions ready to schedule">
          <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">Ready to schedule</h2><span className="text-xs text-muted-foreground">{unscheduled.length}</span></div>
          <p className="mt-1 text-xs text-muted-foreground">Accepted sessions appear here until they have a room and time.</p>
          <div className="mt-3 space-y-2">
            {unscheduled.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Everything accepted is scheduled.</p> : unscheduled.map((submission) => {
              const active = dragged?.kind === "submission" && dragged.id === submission.id;
              return <button key={submission.id} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", `submission:${submission.id}`); setDragged({ kind: "submission", id: submission.id }); }} onDragEnd={() => { setDragged(undefined); setDragTarget(undefined); }} onClick={() => setDragged({ kind: "submission", id: submission.id })} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setDragged({ kind: "submission", id: submission.id }); } }} className={`w-full rounded-md p-3 text-left transition-colors ${active ? "bg-primary text-primary-foreground" : "bg-card hover:bg-accent"}`}><span className="block text-sm font-semibold">{submission.title ?? "Untitled accepted session"}</span><span className="mt-1 block text-xs opacity-75">{submission.speakerIds.length ? "Speaker attached" : "No speaker assigned"}</span></button>;
            })}
          </div>
        </aside>
      <div className={cardSurfaceClasses("default", "overflow-x-auto")}>
        <div className="min-w-[700px] p-3">
          <div
            className="grid auto-rows-[28px] gap-x-px overflow-hidden rounded-md bg-muted/60 text-sm"
            style={{
              gridTemplateColumns: `96px repeat(${Math.max(rooms.length, 1)}, minmax(190px, 1fr))`,
            }}
          >
            <div className="sticky top-0 z-20 flex items-center bg-card px-3 py-2 text-xs font-medium text-muted-foreground">
              Time
            </div>
            {rooms.map((room, roomIndex) => (
              <div
                key={room.id}
                className="sticky top-0 z-20 flex items-center bg-card px-3 py-2 text-xs font-semibold text-foreground"
                style={{ gridColumn: roomIndex + 2 }}
              >
                <span className="truncate">{room.name}</span>
              </div>
            ))}
            {slots.map((slot, slotIndex) => {
              const isHour = slotIndex % 4 === 0;
              return (
                <Fragment key={slot}>
                  <div
                    className={
                      isHour
                        ? "flex items-start gap-1.5 bg-muted/60 px-3 pt-1 text-sm font-semibold text-foreground"
                        : "bg-card"
                    }
                    style={{ gridColumn: 1, gridRow: slotIndex + 2 }}
                  >
                    {isHour && (
                      <>
                        <Clock3 className="mt-px h-3 w-3 shrink-0" />
                        <span className="whitespace-nowrap">
                          {formatTime(slot, timeZone)}
                        </span>
                      </>
                    )}
                  </div>
                  {rooms.map((room, roomIndex) => {
                    const targetId = `${slot}-${room.id}`;
                    const isActiveTarget = dragged && dragTarget === targetId;
                    const blocked = Boolean(dragged && targetBlocked(room.id, slot));
                    return (
                      <div
                        key={targetId}
                        className={
                          blocked
                            ? "min-h-7 bg-destructive/10"
                            : isActiveTarget
                            ? "min-h-7 bg-accent/70 transition-colors"
                            : isHour
                              ? "min-h-7 bg-muted/60 transition-colors hover:bg-muted/80"
                              : "min-h-7 bg-card transition-colors hover:bg-muted/40"
                        }
                        style={{
                          gridColumn: roomIndex + 2,
                          gridRow: slotIndex + 2,
                        }}
                        aria-label={`${room.name} at ${formatDay(roomDay, timeZone)} ${formatTime(slot, timeZone)}`}
                        aria-disabled={blocked}
                        tabIndex={dragged ? 0 : -1}
                        onClick={() => { if (dragged) void place(room.id, slot).catch(() => undefined); }}
                        onDragEnter={() => setDragTarget(targetId)}
                        onDragOver={(dragEvent) => {
                          dragEvent.preventDefault();
                          dragEvent.dataTransfer.dropEffect = "move";
                          setDragTarget(targetId);
                        }}
                        onDrop={(dropEvent) => {
                          dropEvent.preventDefault();
                          const current = parseAgendaDragItem(
                            dropEvent.dataTransfer.getData("text/plain"),
                          );
                          if (current)
                            void place(room.id, slot, current).catch(() => undefined);
                        }}
                        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void place(room.id, slot).catch(() => undefined); } if (event.key === "Escape") { setDragged(undefined); setDragTarget(undefined); } }}
                      />
                    );
                  })}
                </Fragment>
              );
            })}
            {dayItems.map((session) => {
              const roomIndex = rooms.findIndex(
                (room) => room.id === session.roomId,
              );
              const slotIndex = slots.findIndex(
                (slot) =>
                  slot === snapToAgendaInterval(session.startTime, timeZone),
              );
              if (roomIndex < 0 || slotIndex < 0) return null;
              const durationRows = Math.max(
                1,
                Math.round(
                  (session.endTime - session.startTime) / (15 * 60_000),
                ),
              );
              const isDragging = dragged?.kind === "session" && dragged.id === session.id;
              return (
                <article
                  key={session.id}
                  draggable
                  aria-label={`${session.title}, ${formatTime(session.startTime, timeZone)} to ${formatTime(session.endTime, timeZone)}`}
                  onDragStart={(dragEvent) => {
                    dragEvent.dataTransfer.effectAllowed = "move";
                    dragEvent.dataTransfer.setData("text/plain", `session:${session.id}`);
                    setDragged({ kind: "session", id: session.id });
                  }}
                  onDragEnd={() => {
                    setDragged(undefined);
                    setDragTarget(undefined);
                  }}
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setDragged({ kind: "session", id: session.id }); } if (event.key === "Escape") setDragged(undefined); }}
                  tabIndex={0}
                  className={`group relative z-10 m-1 cursor-grab overflow-hidden rounded-md bg-primary/10 py-1.5 pl-2 pr-7 text-xs text-foreground transition-colors hover:bg-primary/15 active:cursor-grabbing ${dragged ? "pointer-events-none" : ""} ${isDragging ? "opacity-50" : ""}`}
                  style={{
                    gridColumn: roomIndex + 2,
                    gridRow: `${slotIndex + 2} / span ${durationRows}`,
                  }}
                >
                  <p className="truncate font-semibold">{session.title}</p>
                  <p className="truncate font-medium text-primary">
                    {formatTime(session.startTime, timeZone)}–
                    {formatTime(session.endTime, timeZone)}
                  </p>
                  {durationRows >= 4 && session.track && (
                    <p className="truncate text-muted-foreground">
                      {session.track}
                    </p>
                  )}
                  <AgendaMoveControl
                    id={session.id}
                    title={session.title}
                    roomId={session.roomId}
                    startTime={session.startTime}
                    rooms={rooms}
                    timeZone={timeZone}
                    onMove={onMove}
                    compact={durationRows < 3}
                  />
                </article>
              );
            })}
          </div>
        </div>
      </div>
      </div>
    </section>
  );
}

export function agendaRoomSlots(
  date: string,
  items: Pick<AgendaItem, "startTime" | "endTime">[],
  timeZone: string,
  scheduleStartTime = "08:00",
  scheduleEndTime = "18:00",
) {
  const defaultStart = eventDateTimeToEpoch(date, scheduleStartTime, timeZone);
  const defaultEnd = eventDateTimeToEpoch(date, scheduleEndTime, timeZone);
  if (defaultStart === undefined || defaultEnd === undefined) return [];
  const interval = 15 * 60_000;
  const earliest = items.length
    ? Math.min(
        defaultStart,
        ...items.map(
          (item) => Math.floor(item.startTime / interval) * interval,
        ),
      )
    : defaultStart;
  const latest = items.length
    ? Math.max(
        defaultEnd,
        ...items.map((item) => Math.ceil(item.endTime / interval) * interval),
      )
    : defaultEnd;
  const values: number[] = [];
  for (let cursor = earliest; cursor < latest; cursor += interval)
    values.push(cursor);
  return values;
}

function AgendaSessionCard({
  item,
  timeZone,
  compact = false,
}: {
  item: AgendaItem;
  timeZone: string;
  compact?: boolean;
}) {
  return (
    <article
      className={
        compact ? "rounded-md bg-card/80 p-3" : "rounded-md bg-card p-4"
      }
    >
      <p className="text-xs font-medium text-muted-foreground">
        {formatTime(item.startTime, timeZone)}–
        {formatTime(item.endTime, timeZone)} · {item.room}
      </p>
      <h3 className="mt-1 text-sm font-semibold">{item.title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{item.speaker}</p>
    </article>
  );
}

function EmptyAgenda({ message }: { message: string }) {
  return (
    <div className={cardSurfaceClasses("default")}>
      <EmptyState
        compact
        icon={CalendarDays}
        title="No sessions to show"
        message={message}
      />
    </div>
  );
}
function ConflictsView({
  conflicts,
  timeZone,
  onSelectSession,
}: {
  conflicts: ReturnType<typeof conflictSummary>[];
  timeZone: string;
  onSelectSession: (id: string) => void;
}) {
  const valid = conflicts.filter(
    (conflict): conflict is NonNullable<typeof conflict> => Boolean(conflict),
  );
  return (
    <section className="space-y-3">
      {valid.length === 0 ? (
        <div className={cardSurfaceClasses("default", "p-8 text-center")}>
          <p className="font-medium">No room or speaker overlaps</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Availability conflicts are evaluated on the persisted agenda as
            well.
          </p>
        </div>
      ) : (
        valid.map((conflict) => (
          <article
            key={conflict.id}
            className={cardSurfaceClasses("default", "p-5")}
          >
            <div className="flex gap-3">
              {conflict.title.includes("Informational") ? (
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              ) : (
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              )}
              <div>
                <p className="font-medium">{conflict.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {conflict.description}
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <SessionLink
                    item={conflict.first}
                    timeZone={timeZone}
                    onSelect={onSelectSession}
                  />
                  <SessionLink
                    item={conflict.second}
                    timeZone={timeZone}
                    onSelect={onSelectSession}
                  />
                </div>
              </div>
            </div>
          </article>
        ))
      )}
    </section>
  );
}
function SessionLink({
  item,
  timeZone,
  onSelect,
}: {
  item: AgendaItem;
  timeZone: string;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      className="rounded-md bg-muted p-3 text-left transition-colors hover:bg-muted/70"
    >
      <p className="text-sm font-medium">{item.title}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {item.room} · {formatTime(item.startTime, timeZone)}–
        {formatTime(item.endTime, timeZone)}
      </p>
    </button>
  );
}

function DuplicateDayForm({
  days,
  timeZone,
  onDuplicate,
  onCancel,
}: {
  days: string[];
  timeZone: string;
  onDuplicate: (source: string, target: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [source, setSource] = useState(days[0] ?? "");
  const [target, setTarget] = useState(days[1] ?? days[0] ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <form
      className="space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(undefined);
        setSaving(true);
        try {
          await onDuplicate(source, target);
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not duplicate the day.",
          );
        } finally {
          setSaving(false);
        }
      }}
    >
      <p className="text-sm text-muted-foreground">
        Copies every source session to the same local times on the target day as
        drafts. Existing target sessions stay unchanged.
      </p>
      <div className="space-y-2">
        <Label>Source day</Label>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {days.map((day) => (
              <SelectItem key={day} value={day}>
                {formatDay(day, timeZone, "long")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Target day</Label>
        <Select value={target} onValueChange={setTarget}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {days.map((day) => (
              <SelectItem key={day} value={day}>
                {formatDay(day, timeZone, "long")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          variant="accent"
          disabled={saving || !source || !target || source === target}
        >
          {saving ? "Duplicating…" : "Duplicate as drafts"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
import { cardSurfaceClasses } from "@/components/ui/card";
