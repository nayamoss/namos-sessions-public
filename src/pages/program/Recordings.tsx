import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, Film, Link2, Loader2, Search, Upload, Video } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { DataGrid, type DataGridColumn } from "@/components/shared/DataGrid";
import { DetailPane } from "@/components/shared/DetailPane";
import { EmptyState } from "@/components/shared/EmptyState";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { useRepo } from "@/data/repo";
import type { EventVideoAsset, RecordingDetail, RecordingManagerRow, SessionRecording } from "@/data/types";

type Filter = "all" | "missing" | "draft" | "published" | "attention";
type SourceFilter = "all" | "upload" | "asset" | "hosted";
type AttachSource = "upload" | "asset" | "hosted";

function time(value: number, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(value);
}

function day(value: number, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, { timeZone, weekday: "short", month: "short", day: "numeric" }).format(value);
}

function recordingLabel(row: RecordingManagerRow) {
  if (row.recording?.availability === "failed" || row.recording?.availability === "unavailable" || row.replacement?.availability === "failed" || row.replacement?.availability === "unavailable") return "Needs attention";
  if (row.recording?.availability === "uploading") return "Uploading";
  if (row.recording?.availability === "processing") return "Processing";
  if (row.replacement) return row.replacement.availability === "processing" ? "Replacement processing" : "Replacement ready";
  if (!row.recording) return "Missing";
  return row.recording.publicationStatus === "published" ? "Published" : "Ready to publish";
}

function statusBadge(row: RecordingManagerRow) {
  const label = recordingLabel(row);
  const className = label === "Published" ? "bg-success/15 text-success" : label === "Missing" ? "bg-muted text-muted-foreground" : label.includes("attention") || label.includes("Replacement") ? "bg-warning/15 text-warning" : "bg-primary/10 text-primary";
  return <Badge className={className}>{label}</Badge>;
}

function Summary({ label, value, active, onClick }: { label: string; value: number; active?: boolean; onClick: () => void }) {
  return <Button type="button" variant={active ? "accent" : "subtle"} onClick={onClick} aria-pressed={active} className="h-auto min-w-0 flex-col items-start px-3 py-2 text-left"><span className="block text-lg font-semibold tabular-nums">{value}</span><span className={`block text-xs ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{label}</span></Button>;
}

function uploadToStorage(uploadUrl: string, file: File, onProgress: (value: number) => void, onRequest: (request?: XMLHttpRequest) => void) {
  return new Promise<string>((resolve, reject) => {
    const request = new XMLHttpRequest();
    onRequest(request);
    request.open("POST", uploadUrl);
    request.setRequestHeader("content-type", file.type);
    request.upload.onprogress = event => event.lengthComputable && onProgress(Math.round((event.loaded / event.total) * 100));
    request.onerror = () => reject(new Error("The upload was interrupted. Try again."));
    request.onabort = () => reject(new Error("Upload canceled."));
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) return reject(new Error("Upload was rejected."));
      try {
        const { storageId } = JSON.parse(request.responseText) as { storageId?: string };
        if (!storageId) return reject(new Error("Upload did not return a storage ID."));
        resolve(storageId);
      } catch { reject(new Error("Upload returned an invalid response.")); }
    };
    request.send(file);
  }).finally(() => onRequest());
}

function RecordingDetailPane({ eventId, agendaItemId, timeZone, onClose, onChanged }: { eventId: string; agendaItemId: string; timeZone: string; onClose: () => void; onChanged: () => Promise<void> }) {
  const repo = useRepo();
  const [detail, setDetail] = useState<RecordingDetail>();
  const [assets, setAssets] = useState<EventVideoAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [source, setSource] = useState<AttachSource>("upload");
  const [hostedUrl, setHostedUrl] = useState("");
  const [assetId, setAssetId] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>();
  const [detachCandidate, setDetachCandidate] = useState<SessionRecording>();
  const uploadRequest = useRef<XMLHttpRequest>();
  const fileRef = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(undefined);
    try {
      const [nextDetail, nextAssets] = await Promise.all([repo.recordings.get({ eventId: eventId as never, agendaItemId }), repo.recordings.listAssets({ eventId: eventId as never })]);
      setDetail(nextDetail); setAssets(nextAssets);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load this recording."); }
    finally { setLoading(false); }
  }, [agendaItemId, eventId, repo]);
  useEffect(() => { void load(); return () => uploadRequest.current?.abort(); }, [load]);
  const active = detail?.recordings.find(recording => recording.role === "active");
  const replacement = detail?.recordings.find(recording => recording.role === "replacement");
  const early = Boolean(detail && detail.session.endTime > Date.now());
  const refresh = async () => Promise.all([load(), onChanged()]).then(() => undefined);
  const attachHosted = async () => {
    setSaving(true); setError(undefined);
    try { await repo.recordings.attachHosted({ eventId: eventId as never, agendaItemId, hostedUrl }); setHostedUrl(""); await refresh(); toast.success("Hosted recording attached as a draft"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not attach the hosted recording."); }
    finally { setSaving(false); }
  };
  const attachAsset = async () => {
    setSaving(true); setError(undefined);
    try { await repo.recordings.attachAsset({ eventId: eventId as never, agendaItemId, assetId }); setAssetId(""); await refresh(); toast.success("Event asset attached as a draft"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not attach the event asset."); }
    finally { setSaving(false); }
  };
  const attachUpload = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) { setError("Choose a supported MP4, WebM, or MOV video file."); return; }
    if (file.size > 250 * 1024 * 1024) { setError("Video uploads must be 250 MB or smaller."); return; }
    setSaving(true); setError(undefined); setUploadProgress(0);
    try {
      const { uploadUrl } = await repo.files.generateUploadUrl();
      const storageId = await uploadToStorage(uploadUrl, file, setUploadProgress, request => { uploadRequest.current = request; });
      await repo.recordings.attachUpload({ eventId: eventId as never, agendaItemId, storageId, fileName: file.name });
      await refresh(); toast.success("Video uploaded and attached as a draft");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not upload the recording."); }
    finally { setSaving(false); setUploadProgress(undefined); }
  };
  const changePublication = async (recording: SessionRecording, action: "publish" | "unpublish") => {
    setSaving(true); setError(undefined);
    try {
      if (action === "publish") await repo.recordings.publish({ eventId: eventId as never, recordingId: recording.id, ...(early ? { overrideReason: overrideReason.trim() } : {}) });
      else await repo.recordings.unpublish({ eventId: eventId as never, recordingId: recording.id });
      await refresh(); setOverrideReason(""); toast.success(action === "publish" ? "Recording published" : "Recording unpublished");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update publication."); }
    finally { setSaving(false); }
  };
  const detach = async () => {
    if (!detachCandidate) return;
    setSaving(true); setError(undefined);
    try { await repo.recordings.detach({ eventId: eventId as never, recordingId: detachCandidate.id }); setDetachCandidate(undefined); await refresh(); toast.success("Draft recording detached"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not detach the recording."); }
    finally { setSaving(false); }
  };
  const publicationAction = (recording: SessionRecording, replacementAction = false) => recording.publicationStatus === "published"
    ? <Button size="sm" variant="outline" disabled={saving} onClick={() => void changePublication(recording, "unpublish")}>Unpublish</Button>
    : <div className="space-y-2">{early && <div className="space-y-1.5"><Label htmlFor={`override-${recording.id}`}>Reason for publishing before the session ends</Label><Input id={`override-${recording.id}`} value={overrideReason} onChange={event => setOverrideReason(event.target.value)} placeholder="Why is early access appropriate?" disabled={saving} /></div>}<div className="flex flex-wrap gap-2"><Button size="sm" disabled={saving || recording.availability !== "ready" || (early && !overrideReason.trim())} onClick={() => void changePublication(recording, "publish")}>{saving ? "Publishing…" : replacementAction ? "Publish replacement" : "Publish"}</Button><Button size="sm" variant="outline" disabled={saving} onClick={() => setDetachCandidate(recording)}>Detach draft</Button></div></div>;
  return <DetailPane title={detail?.session.title ?? "Recording"} onClose={onClose}>
    {loading ? <div className="space-y-3" aria-live="polite"><div className="h-5 w-3/4 animate-pulse rounded bg-muted" /><div className="h-36 animate-pulse rounded bg-muted" /></div> : error && !detail ? <div role="alert" className="space-y-3 text-sm"><p className="text-destructive">{error}</p><Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button></div> : detail ? <div className="space-y-6">
      <div><p className="text-sm text-muted-foreground">{time(detail.session.startTime, timeZone)}</p><p className="mt-1 text-sm text-muted-foreground">Attachments stay private until explicitly published. A staged replacement never interrupts the current public recording.</p></div>
      {active && <RecordingSourceCard label={active.publicationStatus === "published" ? "Live recording" : "Ready draft"} recording={active} action={publicationAction(active)} />}
      {replacement && <RecordingSourceCard label="Staged replacement" recording={replacement} action={publicationAction(replacement, true)} />}
      <section className="space-y-3"><div><h3 className="text-sm font-semibold">{active ? "Replace recording" : "Attach recording"}</h3><p className="mt-1 text-sm text-muted-foreground">Choose a direct upload, a reusable event video, or a secure hosted link.</p></div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Recording source">{(["upload", "asset", "hosted"] as AttachSource[]).map(value => <Button key={value} size="sm" variant={source === value ? "accent" : "outline"} aria-selected={source === value} role="tab" onClick={() => setSource(value)}>{value === "upload" ? <Upload /> : value === "hosted" ? <Link2 /> : <Film />}{value === "upload" ? "Upload video" : value === "asset" ? "Event asset" : "Hosted link"}</Button>)}</div>
        {source === "upload" && <div className="space-y-3 rounded-md bg-muted/70 p-3"><Input ref={fileRef} className="sr-only" id={`recording-upload-${agendaItemId}`} type="file" accept="video/mp4,video/webm,video/quicktime" onChange={event => { void attachUpload(event.target.files?.[0]); event.currentTarget.value = ""; }} disabled={saving} /><label htmlFor={`recording-upload-${agendaItemId}`} className="flex cursor-pointer items-center justify-between gap-3"><span className="text-sm text-muted-foreground">MP4, WebM, or MOV · up to 250 MB</span><span className="inline-flex h-9 items-center gap-2 rounded-md bg-card px-3 text-sm font-medium">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Choose video</span></label>{uploadProgress !== undefined && <div className="space-y-2" aria-live="polite"><div className="h-2 overflow-hidden rounded-full bg-background"><div className="h-full bg-primary transition-[width]" style={{ width: `${uploadProgress}%` }} /></div><div className="flex items-center justify-between text-xs text-muted-foreground"><span>{uploadProgress}% uploaded</span><Button size="sm" variant="ghost" onClick={() => uploadRequest.current?.abort()}>Cancel upload</Button></div></div>}</div>}
        {source === "asset" && <div className="space-y-2"><Select value={assetId} onValueChange={setAssetId} disabled={saving || assets.length === 0}><SelectTrigger aria-label="Existing event video"><SelectValue placeholder={assets.length ? "Choose an event video" : "No event videos available"} /></SelectTrigger><SelectContent>{assets.map(asset => <SelectItem key={asset.id} value={asset.id}>{asset.fileName}</SelectItem>)}</SelectContent></Select><Button size="sm" disabled={saving || !assetId} onClick={() => void attachAsset()}>{saving ? "Attaching…" : "Attach event asset"}</Button></div>}
        {source === "hosted" && <div className="space-y-2"><Input aria-label="Hosted recording URL" value={hostedUrl} onChange={event => setHostedUrl(event.target.value)} placeholder="https://video.example.com/session" disabled={saving} /><Button size="sm" disabled={saving || !hostedUrl.trim()} onClick={() => void attachHosted()}>{saving ? "Attaching…" : "Attach hosted recording"}</Button></div>}
      </section>
      {detail.history && detail.history.length > 0 && <section className="space-y-2"><h3 className="text-sm font-semibold">Activity history</h3><ol className="space-y-2">{detail.history.map(entry => <li key={entry.id} className="rounded-md bg-muted/60 px-3 py-2 text-sm"><span className="font-medium">{entry.action.replaceAll("_", " ")}</span><span className="ml-2 text-muted-foreground">{time(entry.createdAt, timeZone)}</span>{entry.detail && <p className="mt-1 text-muted-foreground">{entry.detail}</p>}</li>)}</ol></section>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div> : null}
    <AlertDialog open={Boolean(detachCandidate)} onOpenChange={open => !open && setDetachCandidate(undefined)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Detach this draft recording?</AlertDialogTitle><AlertDialogDescription>{detachCandidate?.fileName ?? detachCandidate?.hostedUrl ?? "This recording"} will no longer be attached to the session. The underlying event asset is retained.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving}>Keep attached</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={event => { event.preventDefault(); void detach(); }}>{saving ? "Detaching…" : "Detach draft"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </DetailPane>;
}

function RecordingSourceCard({ label, recording, action }: { label: string; recording: SessionRecording; action: React.ReactNode }) {
  return <section className="space-y-3 rounded-md bg-muted/70 p-3"><div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-card text-primary"><Film className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="text-sm font-medium">{label}</p><p className="truncate text-sm text-muted-foreground">{recording.fileName ?? recording.hostedUrl ?? "Uploaded video"}</p>{recording.availability && recording.availability !== "ready" && <p className="mt-1 text-sm text-warning">{recording.failureReason ?? (recording.availability === "processing" ? "Video processing is still in progress." : recording.availability === "uploading" ? "Upload is still in progress." : "This source is not currently available.")}</p>}</div></div>{recording.sourceType !== "hosted" && recording.sourceUrl && <video controls preload="metadata" className="w-full rounded-md bg-foreground/10" src={recording.sourceUrl} />}{recording.sourceType === "hosted" && recording.embedUrl && <iframe className="aspect-video w-full rounded-md bg-black" src={recording.embedUrl} title={`${label} preview`} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />}{recording.sourceType === "hosted" && !recording.embedUrl && recording.sourceUrl && <Button asChild size="sm" variant="secondary"><a href={recording.sourceUrl} rel="noreferrer" target="_blank">Open hosted recording</a></Button>}{action}</section>;
}

export default function Recordings() {
  const repo = useRepo();
  const { event } = useCurrentEvent();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<RecordingManagerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>(() => (params.get("filter") as Filter) || "all");
  const [source, setSource] = useState<SourceFilter>("all");
  const [room, setRoom] = useState("all");
  const [track, setTrack] = useState("all");
  const [eventDay, setEventDay] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const load = useCallback(async () => { setLoading(true); setError(undefined); try { setRows(await repo.recordings.list({ eventId: event.id })); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load recordings."); } finally { setLoading(false); } }, [event.id, repo]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setSelectedIds([]); }, [event.id]);
  const dayOptions = useMemo(() => Array.from(new Set(rows.map(row => day(row.startTime, event.timezone)))), [event.timezone, rows]);
  const roomOptions = useMemo(() => Array.from(new Set(rows.map(row => row.roomName))).sort(), [rows]);
  const trackOptions = useMemo(() => Array.from(new Set(rows.map(row => row.trackName).filter((value): value is string => Boolean(value)))).sort(), [rows]);
  const filtered = useMemo(() => rows.filter(row => {
    if (!`${row.title} ${row.speakerNames.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase())) return false;
    if (filter === "missing" && row.recording) return false;
    if (filter === "draft" && row.recording?.publicationStatus !== "draft") return false;
    if (filter === "published" && row.recording?.publicationStatus !== "published") return false;
    if (filter === "attention" && ![row.recording?.availability, row.replacement?.availability].some(value => value === "failed" || value === "unavailable")) return false;
    if (source !== "all" && row.recording?.sourceType !== source) return false;
    if (room !== "all" && row.roomName !== room) return false;
    if (track !== "all" && row.trackName !== track) return false;
    return eventDay === "all" || day(row.startTime, event.timezone) === eventDay;
  }), [event.timezone, eventDay, filter, query, room, rows, source, track]);
  const selectedId = params.get("session") ?? params.get("selected");
  const selectedRow = rows.find(row => row.id === selectedId);
  const select = (id?: string) => setParams(current => { const next = new URLSearchParams(current); if (id) { next.set("session", id); next.set("selected", id); } else { next.delete("session"); next.delete("selected"); } return next; });
  const setStatus = (value: Filter) => { setFilter(value); setParams(current => { const next = new URLSearchParams(current); if (value === "all") next.delete("filter"); else next.set("filter", value); return next; }); };
  const columns = useMemo<DataGridColumn<RecordingManagerRow>[]>(() => [
    { key: "session", header: "Session", width: "34%", sortValue: row => row.title, cell: row => <div className="min-w-0"><p className="truncate font-medium">{row.title}</p><p className="truncate text-xs text-muted-foreground">{row.speakerNames.join(", ") || "No speakers assigned"}</p></div> },
    { key: "schedule", header: "Schedule", width: "22%", sortValue: row => row.startTime, cell: row => <div><p>{time(row.startTime, event.timezone)}</p><p className="text-xs text-muted-foreground">{row.roomName}</p></div> },
    { key: "recording", header: "Recording", width: "22%", cell: row => <div className="flex items-center gap-2"><Video className="h-4 w-4 text-muted-foreground" /><span className="truncate">{row.recording?.fileName ?? (row.recording?.sourceType === "hosted" ? "Hosted recording" : "No recording")}</span></div> },
    { key: "status", header: "Status", width: "22%", sortValue: row => recordingLabel(row), cell: statusBadge },
  ], [event.timezone]);
  const bulk = async (action: "publish" | "unpublish") => {
    const chosen = rows.filter(row => selectedIds.includes(row.id));
    const recordingIds = chosen.flatMap(row => action === "publish" ? row.replacement?.id ?? (row.recording?.publicationStatus === "draft" ? row.recording.id : []) : row.recording?.publicationStatus === "published" ? row.recording.id : []);
    if (!recordingIds.length) { toast.info(`No selected recordings are eligible to ${action}.`); return; }
    setBulkSaving(true);
    try {
      const results = action === "publish" ? await repo.recordings.bulkPublish({ eventId: event.id, recordingIds }) : await repo.recordings.bulkUnpublish({ eventId: event.id, recordingIds });
      const failed = results.filter(result => result.status === "failed");
      const succeeded = results.length - failed.length;
      if (failed.length) toast.warning(`${succeeded} ${action === "publish" ? "published" : "unpublished"}; ${failed.length} failed`, { description: failed.slice(0, 3).map(result => result.error).join(" · ") });
      else toast.success(`${succeeded} recording${succeeded === 1 ? "" : "s"} ${action === "publish" ? "published" : "unpublished"}`);
      setSelectedIds([]); await load();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : `Could not ${action} recordings.`); }
    finally { setBulkSaving(false); }
  };
  const missing = rows.filter(row => !row.recording).length;
  const drafts = rows.filter(row => row.recording?.publicationStatus === "draft").length;
  const published = rows.filter(row => row.recording?.publicationStatus === "published").length;
  const attention = rows.filter(row => [row.recording?.availability, row.replacement?.availability].some(value => value === "failed" || value === "unavailable")).length;
  return <AppLayout title="Recordings" detail={selectedRow ? <RecordingDetailPane eventId={event.id} agendaItemId={selectedRow.id} timeZone={event.timezone} onClose={() => select()} onChanged={load} /> : undefined}>
    <div className="space-y-4">
      <ContentToolbar ariaLabel="Recording controls" search={<div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={event => setQuery(event.target.value)} className="h-9 pl-9" placeholder="Search sessions or speakers" aria-label="Search recordings" /></div>} utilities={<><Select value={source} onValueChange={value => setSource(value as SourceFilter)}><SelectTrigger className="h-9 w-36" aria-label="Source"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All sources</SelectItem><SelectItem value="upload">Uploads</SelectItem><SelectItem value="asset">Event assets</SelectItem><SelectItem value="hosted">Hosted links</SelectItem></SelectContent></Select><Select value={eventDay} onValueChange={setEventDay}><SelectTrigger className="h-9 w-36" aria-label="Event day"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All days</SelectItem>{dayOptions.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select><Select value={room} onValueChange={setRoom}><SelectTrigger className="h-9 w-36" aria-label="Room"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All rooms</SelectItem>{roomOptions.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select><Select value={track} onValueChange={setTrack}><SelectTrigger className="h-9 w-36" aria-label="Track"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All tracks</SelectItem>{trackOptions.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>{selectedIds.length > 0 && <><Button size="sm" variant="outline" disabled={bulkSaving} onClick={() => void bulk("publish")}>Publish selected</Button><Button size="sm" variant="outline" disabled={bulkSaving} onClick={() => void bulk("unpublish")}>Unpublish selected</Button></>}</>} primaryAction={<Button size="sm" onClick={() => { const target = rows.find(row => !row.recording) ?? rows[0]; if (target) select(target.id); }}>Add recording</Button>} />
      <div className="flex flex-wrap gap-2" aria-label="Recording status filters">{(["all", "missing", "draft", "published", "attention"] as Filter[]).map(value => <Button key={value} size="sm" variant={filter === value ? "subtle" : "outline"} onClick={() => setStatus(value)}>{value === "all" ? "All statuses" : value === "draft" ? "Ready drafts" : value[0].toUpperCase() + value.slice(1)}</Button>)}</div>
      <section aria-label="Recording coverage" className="grid grid-cols-2 gap-2 sm:grid-cols-5"><Summary label="Total sessions" value={rows.length} active={filter === "all"} onClick={() => setStatus("all")} /><Summary label="Missing" value={missing} active={filter === "missing"} onClick={() => setStatus("missing")} /><Summary label="Ready drafts" value={drafts} active={filter === "draft"} onClick={() => setStatus("draft")} /><Summary label="Published" value={published} active={filter === "published"} onClick={() => setStatus("published")} /><Summary label="Needs attention" value={attention} active={filter === "attention"} onClick={() => setStatus("attention")} /></section>
      {error ? <section role="alert" className="flex min-h-48 flex-col items-center justify-center gap-3 text-center"><CircleAlert className="h-6 w-6 text-destructive" /><p className="text-sm text-muted-foreground">{error}</p><Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button></section> : <DataGrid rows={filtered} columns={columns} loading={loading} paginated defaultPageSize={25} ariaLabel="Session recordings" getRowLabel={row => row.title} onRowActivated={row => select(row.id)} selectedIds={selectedIds} onSelectionChange={setSelectedIds} defaultSort={{ key: "schedule", direction: "asc" }} empty={<EmptyState icon={CheckCircle2} title="No sessions match this view" message="Clear a filter or attach recordings to missing sessions." />} />}
    </div>
  </AppLayout>;
}
