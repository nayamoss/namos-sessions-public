import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { Event, Room, Speaker, Submission, Track } from "@/data/types";
import { eventDateTime, eventDateTimeToEpoch, utcCalendarDate } from "@/lib/event-time";

export type AgendaSessionValue = {
  id?: string;
  title: string;
  submissionId?: string;
  speakerIds: string[];
  trackId?: string;
  roomId: string;
  startTime: number;
  endTime: number;
  isPublished: boolean;
};

type Props = {
  event: Event;
  rooms: Room[];
  tracks: Track[];
  speakers: Speaker[];
  submissions: Submission[];
  initial?: AgendaSessionValue;
  onSave: (value: AgendaSessionValue) => Promise<void>;
  onCancel: () => void;
};

export function AgendaSessionForm({ event, rooms, tracks, speakers, submissions, initial, onSave, onCancel }: Props) {
  const eventDate = utcCalendarDate(event.startDate);
  const initialStart = initial ? eventDateTime(initial.startTime, event.timezone) : { date: eventDate, time: "09:00" };
  const initialEnd = initial ? eventDateTime(initial.endTime, event.timezone) : { date: eventDate, time: "09:45" };
  const [mode, setMode] = useState<"submission" | "standalone">(initial?.submissionId ? "submission" : "standalone");
  const [submissionId, setSubmissionId] = useState(initial?.submissionId ?? "none");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [speakerIds, setSpeakerIds] = useState<string[]>(initial?.speakerIds ?? []);
  const [trackId, setTrackId] = useState(initial?.trackId ?? "none");
  const [roomId, setRoomId] = useState(initial?.roomId ?? rooms[0]?.id ?? "");
  const [date, setDate] = useState(initialStart.date);
  const [start, setStart] = useState(initialStart.time);
  const [end, setEnd] = useState(initialEnd.time);
  const [published, setPublished] = useState(initial?.isPublished ?? false);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const locked = mode === "submission" && submissionId !== "none";
  const accepted = useMemo(() => submissions.filter((submission) => submission.status === "accepted"), [submissions]);

  useEffect(() => {
    if (!locked) return;
    const submission = accepted.find((candidate) => candidate.id === submissionId);
    if (!submission) return;
    setTitle(submission.title ?? "Untitled accepted submission");
    setSpeakerIds([...submission.speakerIds]);
    setTrackId(submission.trackId ?? "none");
  }, [accepted, locked, submissionId]);

  const submit = async (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    setError(undefined);
    const startTime = eventDateTimeToEpoch(date, start, event.timezone);
    const endTime = eventDateTimeToEpoch(date, end, event.timezone);
    if (!title.trim()) return setError("Enter a session title.");
    if (!roomId) return setError("Choose a room.");
    if (startTime === undefined || endTime === undefined) return setError(`Choose valid times in ${event.timezone}.`);
    if (startTime >= endTime) return setError("End time must be after start time.");
    const first = utcCalendarDate(event.startDate);
    const last = utcCalendarDate(event.endDate);
    if (date < first || date > last) return setError("Choose a date within the event.");
    setSaving(true);
    try {
      await onSave({ id: initial?.id, title: title.trim(), submissionId: locked ? submissionId : undefined, speakerIds, trackId: trackId === "none" ? undefined : trackId, roomId, startTime, endTime, isPublished: published });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the session.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="space-y-5" onSubmit={submit}>
      {!initial && (
        <div className="space-y-2">
          <Label>Session source</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={mode === "submission" ? "secondary" : "outline"} onClick={() => setMode("submission")}>From submission</Button>
            <Button type="button" variant={mode === "standalone" ? "secondary" : "outline"} onClick={() => { setMode("standalone"); setSubmissionId("none"); }}>Standalone</Button>
          </div>
        </div>
      )}
      {mode === "submission" && (
        <div className="space-y-2">
          <Label htmlFor="agenda-submission">Accepted submission</Label>
          <Select value={submissionId} onValueChange={setSubmissionId}>
            <SelectTrigger id="agenda-submission"><SelectValue placeholder="Choose a submission" /></SelectTrigger>
            <SelectContent><SelectItem value="none">Choose a submission</SelectItem>{accepted.map((submission) => <SelectItem key={submission.id} value={submission.id}>{submission.title ?? "Untitled submission"}</SelectItem>)}</SelectContent>
          </Select>
          {accepted.length === 0 && <p className="text-xs text-muted-foreground">There are no accepted submissions to schedule.</p>}
        </div>
      )}
      <div className="space-y-2"><Label htmlFor="agenda-title">Title</Label><Input id="agenda-title" value={title} disabled={locked} onChange={(event) => setTitle(event.target.value)} /></div>
      <fieldset className="space-y-2" disabled={locked}>
        <legend className="text-sm font-medium">Speakers</legend>
        <div className="max-h-36 space-y-2 overflow-y-auto rounded-md bg-background/70 p-3">
          {speakers.map((speaker) => <label key={speaker.id} className="flex items-center gap-2 text-sm"><Checkbox checked={speakerIds.includes(speaker.id)} onCheckedChange={(checked) => setSpeakerIds((current) => checked ? [...new Set([...current, speaker.id])] : current.filter((id) => id !== speaker.id))} /><span>{speaker.name}</span></label>)}
          {speakers.length === 0 && <p className="text-sm text-muted-foreground">No speakers available.</p>}
        </div>
      </fieldset>
      <div className="space-y-2"><Label htmlFor="agenda-track">Track</Label><Select disabled={locked} value={trackId} onValueChange={setTrackId}><SelectTrigger id="agenda-track"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Unassigned</SelectItem>{tracks.map((track) => <SelectItem key={track.id} value={track.id}>{track.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="agenda-room">Room</Label><Select value={roomId} onValueChange={setRoomId}><SelectTrigger id="agenda-room"><SelectValue placeholder="Choose a room" /></SelectTrigger><SelectContent>{rooms.map((room) => <SelectItem key={room.id} value={room.id}>{room.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="agenda-date">Date</Label><Input id="agenda-date" type="date" min={utcCalendarDate(event.startDate)} max={utcCalendarDate(event.endDate)} value={date} onChange={(event) => setDate(event.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="agenda-start">Start</Label><Input id="agenda-start" type="time" step={900} value={start} onChange={(event) => setStart(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="agenda-end">End</Label><Input id="agenda-end" type="time" step={900} value={end} onChange={(event) => setEnd(event.target.value)} /></div></div>
      <div className="flex items-center justify-between gap-3"><div><Label htmlFor="agenda-published">Published</Label><p className="text-xs text-muted-foreground">Visible to assigned speakers.</p></div><Switch id="agenda-published" checked={published} onCheckedChange={setPublished} /></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2"><Button type="submit" variant="accent" disabled={saving || (mode === "submission" && submissionId === "none")}>{saving ? "Saving…" : "Save session"}</Button><Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>Cancel</Button></div>
    </form>
  );
}
