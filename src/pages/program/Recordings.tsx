import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, CheckCircle2, CircleAlert, Film, Link2, Loader2, Search, Upload, Video, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { useCurrentEvent } from "@/components/EventContext";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { DataGrid, type DataGridColumn } from "@/components/shared/DataGrid";
import { DetailPane } from "@/components/shared/DetailPane";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileInput } from "@/components/ui/file-input";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useRepo } from "@/data/repo";
import type { EventAsset, RecordingDetail, RecordingManagerFilters, RecordingManagerRow, RecordingManagerSort, SessionRecording } from "@/data/types";

type Filter = "all" | "missing" | "draft" | "published" | "replacement" | "unavailable";
type SourceFilter = "all" | "upload" | "asset" | "hosted";

function time(value: number, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(value);
}

function dayKey(value: number, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
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
  return <Button type="button" variant="ghost" onClick={onClick} aria-pressed={active} className={`h-auto min-w-0 rounded-md px-3 py-2 text-left transition-colors ${active ? "bg-primary text-primary-foreground hover:bg-primary" : "bg-muted hover:bg-muted/75"}`}><span className="block text-lg font-semibold tabular-nums">{value}</span><span className={`block text-xs ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{label}</span></Button>;
}

function RecordingFilterMenu({ label, value, values, onChange }: { label: string; value: string; values: Array<[string, string]>; onChange: (value: string) => void }) {
  const selectedLabel = values.find(([candidate]) => candidate === value)?.[1] ?? label;
  return <DropdownMenu><DropdownMenuTrigger asChild><Button size="sm" variant={value === "all" ? "outline" : "subtle"}><CalendarDays className="h-3.5 w-3.5" />{label}: {selectedLabel}</Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="max-h-72 overflow-y-auto"><DropdownMenuLabel>{label}</DropdownMenuLabel><DropdownMenuSeparator />{values.map(([candidate, candidateLabel]) => <DropdownMenuCheckboxItem key={candidate} checked={value === candidate} onSelect={event => { event.preventDefault(); onChange(candidate); }}>{candidateLabel}</DropdownMenuCheckboxItem>)}</DropdownMenuContent></DropdownMenu>;
}

function RecordingDetailPane({ eventId, agendaItemId, onClose, onChanged }: { eventId: string; agendaItemId: string; onClose: () => void; onChanged: () => Promise<void> }) {
  const repo = useRepo();
  const [detail, setDetail] = useState<RecordingDetail>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [source, setSource] = useState<"upload" | "asset" | "hosted">("upload");
  const [assets, setAssets] = useState<EventAsset[]>([]);
  const [hostedUrl, setHostedUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number>();
  const [overrideReason, setOverrideReason] = useState("");
  const [detachCandidate, setDetachCandidate] = useState<SessionRecording>();
  const uploadRequest = useRef<XMLHttpRequest>();
  const fileRef = useRef<HTMLInputElement>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(undefined);
    try { setDetail(await repo.recordings.get({ eventId: eventId as never, agendaItemId })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load this recording."); }
    finally { setLoading(false); }
  }, [agendaItemId, eventId, repo]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void repo.recordings.listAssets({ eventId: eventId as never }).then(setAssets).catch(() => setAssets([])); }, [eventId, repo]);
  const active = detail?.recordings.find(recording => recording.role === "active");
  const replacement = detail?.recordings.find(recording => recording.role === "replacement");
  const attachHosted = async () => {
    setSaving(true); setUploadPercent(0); setError(undefined);
    try { await repo.recordings.attachHosted({ eventId: eventId as never, agendaItemId, hostedUrl }); setHostedUrl(""); await Promise.all([load(), onChanged()]); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not attach the hosted recording."); }
    finally { setSaving(false); }
  };
  const attachUpload = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) { setError("Choose a supported video file."); return; }
    setSaving(true); setError(undefined);
    try {
      const { uploadUrl } = await repo.recordings.requestUpload({ eventId: eventId as never, agendaItemId });
      const payload = await new Promise<{ storageId?: string }>((resolve, reject) => {
        const request = new XMLHttpRequest(); uploadRequest.current = request;
        request.open("POST", uploadUrl); request.setRequestHeader("content-type", file.type);
        request.upload.onprogress = event => { if (event.lengthComputable) setUploadPercent(Math.round(event.loaded / event.total * 100)); };
        request.onerror = () => reject(new Error("Upload was rejected."));
        request.onabort = () => reject(new Error("Upload cancelled."));
        request.onload = () => request.status >= 200 && request.status < 300 ? resolve(JSON.parse(request.responseText) as { storageId?: string }) : reject(new Error("Upload was rejected."));
        request.send(file);
      });
      const { storageId } = payload;
      if (!storageId) throw new Error("Upload did not return a storage ID.");
      await repo.recordings.attachUpload({ eventId: eventId as never, agendaItemId, storageId, fileName: file.name });
      await Promise.all([load(), onChanged()]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not upload the recording."); }
    finally { uploadRequest.current = undefined; setSaving(false); setUploadPercent(undefined); }
  };
  const changePublication = async (recording: SessionRecording, action: "publish" | "unpublish") => {
    setSaving(true); setError(undefined);
    try { await repo.recordings[action]({ eventId: eventId as never, recordingId: recording.id, ...(action === "publish" && overrideReason.trim() ? { overrideReason: overrideReason.trim() } : {}) }); setOverrideReason(""); await Promise.all([load(), onChanged()]); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update publication."); }
    finally { setSaving(false); }
  };
  return <DetailPane title={detail?.session.title ?? "Recording"} onClose={onClose}>
    {loading ? <div className="space-y-3" aria-live="polite"><div className="h-5 w-3/4 animate-pulse rounded bg-muted" /><div className="h-36 animate-pulse rounded bg-muted" /></div> : error && !detail ? <div role="alert" className="space-y-3 text-sm"><p className="text-destructive">{error}</p><Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button></div> : detail ? <div className="space-y-6">
      <div><p className="text-sm text-muted-foreground">{time(detail.session.startTime, "UTC")}</p><p className="mt-1 text-sm text-muted-foreground">Attach a draft first; only published recordings appear to attendees. Publishing before the session ends requires an audited override.</p></div>
      {active && <RecordingSourceCard label={active.publicationStatus === "published" ? "Live recording" : "Ready draft"} recording={active} action={<div className="flex flex-wrap gap-2">{active.availability === "unavailable" && <Button size="sm" variant="outline" disabled={saving} onClick={() => { setSaving(true); void repo.recordings.retry({ eventId: eventId as never, recordingId: active.id }).then(async () => { await Promise.all([load(), onChanged()]); }).catch(cause => setError(cause instanceof Error ? cause.message : "Could not retry the recording.")).finally(() => setSaving(false)); }}>Retry availability</Button>}{active.publicationStatus === "published" ? <Button size="sm" variant="outline" disabled={saving} onClick={() => void changePublication(active, "unpublish")}>Unpublish</Button> : <Button size="sm" disabled={saving || active.availability === "unavailable"} onClick={() => void changePublication(active, "publish")}>{saving ? "Publishing…" : "Publish"}</Button>} {active.publicationStatus === "draft" && <Button size="sm" variant="ghost" disabled={saving} onClick={() => setDetachCandidate(active)}>Detach</Button>}</div>} />}
      {replacement && <RecordingSourceCard label="Staged replacement" recording={replacement} action={<Button size="sm" disabled={saving} onClick={() => void changePublication(replacement, "publish")}>{saving ? "Promoting…" : "Publish replacement"}</Button>} />}
      <section className="space-y-3"><div><h3 className="text-sm font-semibold">{active ? "Replace recording" : "Attach recording"}</h3><p className="mt-1 text-sm text-muted-foreground">A replacement stays private until you publish it.</p></div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Recording source"><Button size="sm" variant={source === "upload" ? "accent" : "outline"} aria-selected={source === "upload"} role="tab" onClick={() => setSource("upload")}><Upload />Upload video</Button><Button size="sm" variant={source === "asset" ? "accent" : "outline"} aria-selected={source === "asset"} role="tab" onClick={() => setSource("asset")}><Film />Event asset</Button><Button size="sm" variant={source === "hosted" ? "accent" : "outline"} aria-selected={source === "hosted"} role="tab" onClick={() => setSource("hosted")}><Link2 />Hosted link</Button></div>
        {source === "upload" ? <div className="rounded-md bg-muted/70 p-3"><FileInput ref={fileRef} id={`recording-upload-${agendaItemId}`} accept="video/*" onChange={(event) => { void attachUpload(event.target.files?.[0]); event.currentTarget.value = ""; }} disabled={saving} /><label htmlFor={`recording-upload-${agendaItemId}`} className="flex cursor-pointer items-center justify-between gap-3"><span className="text-sm text-muted-foreground">MP4, WebM, or MOV · up to 250 MB{uploadPercent !== undefined ? ` · ${uploadPercent}%` : ""}</span><span className="inline-flex h-9 items-center gap-2 rounded-md bg-card px-3 text-sm font-medium">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Choose video</span></label>{saving && uploadPercent !== undefined && <div className="mt-3 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded bg-card"><div className="h-full bg-primary transition-[width]" style={{ width: `${uploadPercent}%` }} /></div><Button size="sm" variant="ghost" onClick={() => uploadRequest.current?.abort()}><X />Cancel</Button></div>}</div> : source === "asset" ? <div className="space-y-2">{assets.length ? assets.map(asset => <Button type="button" variant="ghost" key={asset.id} disabled={saving} className="flex h-auto w-full items-center justify-between rounded-md bg-muted/70 p-3 text-left hover:bg-muted disabled:opacity-60" onClick={() => { setSaving(true); void repo.recordings.attachAsset({ eventId: eventId as never, agendaItemId, assetId: asset.id }).then(async () => { await Promise.all([load(), onChanged()]); }).catch(cause => setError(cause instanceof Error ? cause.message : "Could not attach the asset.")).finally(() => setSaving(false)); }}><span className="min-w-0"><span className="block truncate text-sm font-medium">{asset.fileName}</span><span className="text-xs text-muted-foreground">{Math.ceil(asset.sizeBytes / 1024 / 1024)} MB · reuse without uploading again</span></span><Film className="h-4 w-4 shrink-0 text-primary" /></Button>) : <p className="rounded-md bg-muted/70 p-3 text-sm text-muted-foreground">No reusable event videos yet. Upload one first.</p>}</div> : <div className="space-y-2"><Input aria-label="Hosted recording URL" value={hostedUrl} onChange={(event) => setHostedUrl(event.target.value)} placeholder="https://video.example.com/session" disabled={saving} /><Button size="sm" disabled={saving || !hostedUrl.trim()} onClick={() => void attachHosted()}>{saving ? "Attaching…" : "Attach hosted recording"}</Button></div>}
      </section>
      {detail.session.endTime > Date.now() && active?.publicationStatus === "draft" && <section className="space-y-2 rounded-md bg-warning/10 p-3"><p className="text-sm font-medium">Publish before this session ends</p><Input aria-label="Early publication override reason" value={overrideReason} onChange={event => setOverrideReason(event.target.value)} placeholder="Why is this safe to publish now?" /><p className="text-xs text-muted-foreground">This reason is recorded in the activity history when you publish.</p></section>}
      {detail.history?.length ? <section className="space-y-2"><h3 className="text-sm font-semibold">History</h3>{detail.history.slice(0, 5).map(item => <p key={item.id} className="text-xs text-muted-foreground">{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(item.createdAt)} · {item.action.replace(/_/g, " ")}{item.detail ? ` — ${item.detail}` : ""}</p>)}</section> : null}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div> : null}
    <AlertDialog open={Boolean(detachCandidate)} onOpenChange={open => !open && setDetachCandidate(undefined)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Detach this draft recording?</AlertDialogTitle><AlertDialogDescription>{detachCandidate?.fileName ?? detachCandidate?.hostedUrl} will be removed from this session. The reusable uploaded asset will remain available for other sessions.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving}>Keep recording</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={event => { event.preventDefault(); if (!detachCandidate) return; setSaving(true); void repo.recordings.detach({ eventId: eventId as never, recordingId: detachCandidate.id }).then(async () => { setDetachCandidate(undefined); await Promise.all([load(), onChanged()]); }).catch(cause => setError(cause instanceof Error ? cause.message : "Could not detach the recording.")).finally(() => setSaving(false)); }}>Detach recording</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<string>();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [roomFilter, setRoomFilter] = useState("all");
  const [trackFilter, setTrackFilter] = useState("all");
  const [dayFilter, setDayFilter] = useState("all");
  const [sort, setSort] = useState<RecordingManagerSort>("schedule_asc");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string>();
  const [migrationExceptions, setMigrationExceptions] = useState<Array<{ agendaItemId: string; title: string; value: string; reason: string }>>([]);
  const managerFilters = useMemo<RecordingManagerFilters>(() => ({
    ...(query.trim() ? { query: query.trim() } : {}),
    ...(filter !== "all" ? { status: filter } : {}),
    ...(sourceFilter !== "all" ? { source: sourceFilter } : {}),
    ...(roomFilter !== "all" ? { roomId: roomFilter } : {}),
    ...(trackFilter !== "all" ? { trackId: trackFilter } : {}),
    ...(dayFilter !== "all" ? { day: dayFilter } : {}),
    timeZone: event.timezone,
    sort,
  }), [dayFilter, event.timezone, filter, query, roomFilter, sort, sourceFilter, trackFilter]);
  const load = useCallback(async () => { setLoading(true); setError(undefined); try { const result = await repo.recordings.listPage({ eventId: event.id, ...managerFilters, paginationOpts: { numItems: 100, cursor: null } }); setRows(result.page); setNextCursor(result.continueCursor); setIsDone(result.isDone); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load recordings."); } finally { setLoading(false); } }, [event.id, managerFilters, repo]);
  const loadMore = async () => { if (!nextCursor || isDone || loadingMore) return; setLoadingMore(true); try { const result = await repo.recordings.listPage({ eventId: event.id, ...managerFilters, paginationOpts: { numItems: 100, cursor: nextCursor } }); setRows(current => [...current, ...result.page]); setNextCursor(result.continueCursor); setIsDone(result.isDone); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load more recordings."); } finally { setLoadingMore(false); } };
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const requested = params.get("filter");
    const requestedSource = params.get("source");
    if (["all", "missing", "draft", "published", "replacement", "unavailable"].includes(requested ?? "")) setFilter(requested as Filter);
    if (["all", "upload", "asset", "hosted"].includes(requestedSource ?? "")) setSourceFilter(requestedSource as SourceFilter);
    setQuery(params.get("q") ?? "");
    setRoomFilter(params.get("room") ?? "all");
    setTrackFilter(params.get("track") ?? "all");
    setDayFilter(params.get("day") ?? "all");
    setSort(params.get("sort") === "schedule_desc" ? "schedule_desc" : "schedule_asc");
  }, [params]);
  const selectedId = params.get("selected");
  const selectedRow = rows.find(row => row.id === selectedId);
  const select = (id?: string) => setParams(current => { const next = new URLSearchParams(current); if (id) next.set("selected", id); else next.delete("selected"); return next; });
  const applyFilter = (value: Filter) => { setFilter(value); setParams(current => { const next = new URLSearchParams(current); if (value === "all") next.delete("filter"); else next.set("filter", value); return next; }); };
  const applyQueryFilter = (key: "source" | "room" | "track" | "day", value: string) => setParams(current => { const next = new URLSearchParams(current); if (value === "all") next.delete(key); else next.set(key, value); return next; });
  const rooms = useMemo(() => [...new Map(rows.map(row => [row.roomId, row.roomName])).entries()].sort((left, right) => left[1].localeCompare(right[1])), [rows]);
  const tracks = useMemo(() => [...new Map(rows.flatMap(row => row.trackId && row.trackName ? [[row.trackId, row.trackName] as [string, string]] : [])).entries()].sort((left, right) => left[1].localeCompare(right[1])), [rows]);
  const days = useMemo(() => [...new Set(rows.map(row => dayKey(row.startTime, event.timezone)))].sort(), [event.timezone, rows]);
  const runBulk = async (action: "publish" | "unpublish") => {
    const recordingIds = rows.filter(row => selectedIds.includes(row.id)).map(row => row.recording?.id).filter(Boolean) as string[];
    if (!recordingIds.length) return;
    setBulkBusy(true); setBulkMessage(undefined);
    try { const result = action === "publish" ? await repo.recordings.bulkPublish({ eventId: event.id, recordingIds }) : await repo.recordings.bulkUnpublish({ eventId: event.id, recordingIds }); const failed = result.filter(item => item.status === "failed"); setBulkMessage(failed.length ? `${result.length - failed.length} updated; ${failed.length} need attention.` : `${result.length} recordings ${action === "publish" ? "published" : "unpublished"}.`); setSelectedIds([]); await load(); }
    catch (cause) { setBulkMessage(cause instanceof Error ? cause.message : "Could not update selected recordings."); }
    finally { setBulkBusy(false); }
  };
  const importLegacy = async () => { setBulkBusy(true); setBulkMessage(undefined); setMigrationExceptions([]); try { const result = await repo.recordings.migrateLegacy({ eventId: event.id }); setMigrationExceptions(result.exceptions); setBulkMessage(`Imported ${result.created} legacy links as drafts${result.invalid ? `; ${result.invalid} invalid links need review` : ""}.`); await load(); } catch (cause) { setBulkMessage(cause instanceof Error ? cause.message : "Could not import legacy links."); } finally { setBulkBusy(false); } };
  const columns = useMemo<DataGridColumn<RecordingManagerRow>[]>(() => [
    { key: "session", header: "Session", width: "34%", sortValue: row => row.title, cell: row => <div className="min-w-0"><p className="truncate font-medium">{row.title}</p><p className="truncate text-xs text-muted-foreground">{row.speakerNames.join(", ") || "No speakers assigned"}</p></div> },
    { key: "schedule", header: "Schedule", width: "22%", sortValue: row => row.startTime, cell: row => <div><p>{time(row.startTime, event.timezone)}</p><p className="text-xs text-muted-foreground">{row.roomName}</p></div> },
    { key: "recording", header: "Recording", width: "22%", cell: row => <div className="flex items-center gap-2"><Video className="h-4 w-4 text-muted-foreground" /><span className="truncate">{row.recording?.fileName ?? (row.recording?.sourceType === "hosted" ? "Hosted recording" : "No recording")}</span></div> },
    { key: "status", header: "Status", width: "22%", sortValue: row => recordingLabel(row), cell: statusBadge },
  ], [event.timezone]);
  const missing = rows.filter(row => !row.recording).length;
  const drafts = rows.filter(row => row.recording?.publicationStatus === "draft").length;
  const published = rows.filter(row => row.recording?.publicationStatus === "published").length;
  const replacements = rows.filter(row => row.replacement).length;
  return <AppLayout title="Recordings" detail={selectedRow ? <RecordingDetailPane eventId={event.id} agendaItemId={selectedRow.id} onClose={() => select()} onChanged={load} /> : undefined}>
    <div className="space-y-4">
      <ContentToolbar ariaLabel="Recording controls" search={<div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => { const value = event.target.value; setQuery(value); setParams(current => { const next = new URLSearchParams(current); if (value.trim()) next.set("q", value); else next.delete("q"); return next; }); }} className="h-9 pl-9" placeholder="Search sessions or speakers" aria-label="Search recordings" /></div>} utilities={<div className="flex flex-wrap gap-2">{(["all", "missing", "draft", "published", "replacement", "unavailable"] as Filter[]).map(value => <Button key={value} size="sm" variant={filter === value ? "subtle" : "outline"} onClick={() => applyFilter(value)}>{value === "all" ? "All" : value === "draft" ? "Ready drafts" : value === "replacement" ? "Replacements" : value === "unavailable" ? "Unavailable" : value[0].toUpperCase() + value.slice(1)}</Button>)}<RecordingFilterMenu label="Source" value={sourceFilter} values={[["all", "Any source"], ["upload", "Direct upload"], ["asset", "Event asset"], ["hosted", "Hosted link"]]} onChange={value => { setSourceFilter(value as SourceFilter); applyQueryFilter("source", value); }} /><RecordingFilterMenu label="Room" value={roomFilter} values={[["all", "All rooms"] as [string, string], ...rooms]} onChange={value => { setRoomFilter(value); applyQueryFilter("room", value); }} /><RecordingFilterMenu label="Track" value={trackFilter} values={[["all", "All tracks"] as [string, string], ...tracks]} onChange={value => { setTrackFilter(value); applyQueryFilter("track", value); }} /><RecordingFilterMenu label="Day" value={dayFilter} values={[["all", "All days"] as [string, string], ...days.map(day => [day, day] as [string, string])]} onChange={value => { setDayFilter(value); applyQueryFilter("day", value); }} /><RecordingFilterMenu label="Sort" value={sort} values={[["schedule_asc", "Schedule · earliest"], ["schedule_desc", "Schedule · latest"]]} onChange={value => { const nextSort = value as RecordingManagerSort; setSort(nextSort); setParams(current => { const next = new URLSearchParams(current); if (nextSort === "schedule_asc") next.delete("sort"); else next.set("sort", nextSort); return next; }); }} /></div>} primaryAction={<Button size="sm" onClick={() => { const target = rows.find(row => !row.recording) ?? rows[0]; if (target) select(target.id); }}>Add recording</Button>} />
      <section aria-label="Recording coverage" className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Summary label="Missing" value={missing} active={filter === "missing"} onClick={() => applyFilter("missing")} /><Summary label="Ready drafts" value={drafts} active={filter === "draft"} onClick={() => applyFilter("draft")} /><Summary label="Published" value={published} active={filter === "published"} onClick={() => applyFilter("published")} /><Summary label="Replacements" value={replacements} active={filter === "replacement"} onClick={() => applyFilter("replacement")} /></section>
      {selectedIds.length > 0 && <section className="flex flex-wrap items-center gap-2 rounded-md bg-muted/70 p-3" aria-label="Bulk recording actions"><p className="mr-auto text-sm font-medium">{selectedIds.length} selected</p><Button size="sm" disabled={bulkBusy} onClick={() => void runBulk("publish")}>Publish selected</Button><Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => void runBulk("unpublish")}>Unpublish selected</Button><Button size="sm" variant="ghost" disabled={bulkBusy} onClick={() => setSelectedIds([])}>Clear</Button></section>}
      <div className="flex justify-end"><Button size="sm" variant="ghost" disabled={bulkBusy} onClick={() => void importLegacy()}>Import legacy video links</Button></div>
      {bulkMessage && <p role="status" className="text-sm text-muted-foreground">{bulkMessage}</p>}
      {migrationExceptions.length > 0 && <section className="space-y-2 rounded-md bg-warning/10 p-3" aria-label="Legacy recording migration exceptions"><h2 className="text-sm font-semibold">Legacy links needing review</h2>{migrationExceptions.map(exception => <Button type="button" variant="ghost" key={exception.agendaItemId} className="block h-auto w-full text-left text-sm hover:underline" onClick={() => select(exception.agendaItemId)}><span className="font-medium">{exception.title}</span><span className="block text-xs text-muted-foreground">{exception.reason} · {exception.value}</span></Button>)}</section>}
      {error ? <section role="alert" className="flex min-h-48 flex-col items-center justify-center gap-3 text-center"><CircleAlert className="h-6 w-6 text-destructive" /><p className="text-sm text-muted-foreground">{error}</p><Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button></section> : <><div className="md:hidden space-y-2">{rows.map(row => <Button key={row.id} type="button" variant="ghost" className="h-auto w-full rounded-md bg-card p-3 text-left ring-1 ring-inset ring-foreground/10" onClick={() => select(row.id)}><div className="flex justify-between gap-3"><p className="font-medium">{row.title}</p>{statusBadge(row)}</div><p className="mt-1 text-xs text-muted-foreground">{time(row.startTime, event.timezone)} · {row.roomName}</p></Button>)}</div><div className="hidden md:block"><DataGrid rows={rows} columns={columns} loading={loading} paginated defaultPageSize={25} ariaLabel="Session recordings" getRowLabel={row => row.title} onRowActivated={row => select(row.id)} selectedIds={selectedIds} onSelectionChange={setSelectedIds} empty={<EmptyState icon={CheckCircle2} title="Every session is covered" message="There are no recordings in this view." />} /></div>{!isDone && <div className="flex justify-center"><Button size="sm" variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Loading…" : "Load more sessions"}</Button></div>}</>}
    </div>
  </AppLayout>;
}
