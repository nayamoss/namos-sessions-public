import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { mutation, query, assertEventOrganizerAccess } from "./functions";

type Provider = "convex" | "youtube" | "vimeo" | "external";
type Ctx = QueryCtx | MutationCtx;

export function hostedSource(value: string): { url: string; provider: Exclude<Provider, "convex">; embedUrl?: string } {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error("Enter a valid HTTPS recording URL."); }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Hosted recordings must be credential-free HTTPS URLs.");
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  // Exact-match or require a "." boundary before the suffix — `host.endsWith("youtube.com")`
  // alone also matches a hostile host like "evilyoutube.com" or "attacker.com/youtube.com"
  // (path, not host, so irrelevant here, but the same class of bug), letting an attacker-controlled
  // domain sail through as if it were really youtube.com/vimeo.com.
  const isHost = (candidate: string, suffix: string) => candidate === suffix || candidate.endsWith(`.${suffix}`);
  const youtube = host === "youtu.be" ? url.pathname.slice(1) : isHost(host, "youtube.com") ? url.searchParams.get("v") ?? (url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1]) : undefined;
  if (youtube && /^[\w-]{6,}$/.test(youtube)) return { url: url.toString(), provider: "youtube", embedUrl: `https://www.youtube-nocookie.com/embed/${youtube}` };
  const vimeo = isHost(host, "vimeo.com") ? url.pathname.match(/\/(\d+)(?:\/|$)/)?.[1] : undefined;
  if (vimeo) return { url: url.toString(), provider: "vimeo", embedUrl: `https://player.vimeo.com/video/${vimeo}` };
  return { url: url.toString(), provider: "external" };
}
async function session(ctx: Ctx, eventId: Id<"events">, agendaItemId: Id<"agenda_items">) { const row = await ctx.db.get(agendaItemId); if (!row || row.eventId !== eventId) throw new Error("Session not found for this event."); return row; }
async function activity(ctx: MutationCtx, eventId: Id<"events">, agendaItemId: Id<"agenda_items">, actorUserId: string, action: "attached" | "published" | "published_early" | "unpublished" | "replaced" | "detached" | "retried" | "migrated", recordingId?: Id<"session_recordings">, detail?: string) { await ctx.db.insert("recording_activity", { eventId, agendaItemId, recordingId, action, detail, actorUserId, createdAt: Date.now() }); }
async function sourceUrl(ctx: QueryCtx, row: Doc<"session_recordings">) { if (row.sourceType === "hosted") return row.hostedUrl; const asset = row.assetId ? await ctx.db.get(row.assetId as Id<"event_assets">) : undefined; const storageId = row.storageId ?? asset?.storageId; return storageId ? ctx.storage.getUrl(storageId) : undefined; }
type RecordingSource = { sourceType: "hosted"; hostedUrl: string; provider: Exclude<Provider, "convex"> } | { sourceType: "upload" | "asset"; assetId: Id<"event_assets">; fileName: string; provider: "convex" };
async function attach(ctx: MutationCtx, eventId: Id<"events">, agendaItemId: Id<"agenda_items">, actor: string, source: RecordingSource, legacy = false) {
  const active = await ctx.db.query("session_recordings").withIndex("by_agenda_item_role", q => q.eq("agendaItemId", agendaItemId).eq("role", "active")).first();
  const role = active?.eventId === eventId ? "replacement" as const : "active" as const;
  const candidate = await ctx.db.query("session_recordings").withIndex("by_agenda_item_role", q => q.eq("agendaItemId", agendaItemId).eq("role", role)).first();
  if (candidate?.eventId === eventId && candidate.publicationStatus === "draft") await ctx.db.delete(candidate._id);
  const now = Date.now(); const id = await ctx.db.insert("session_recordings", { eventId, agendaItemId, ...source, role, publicationStatus: "draft", availability: "ready", ...(legacy ? { legacySource: "agenda_video_url" as const } : {}), createdByUserId: actor, createdAt: now, updatedAt: now });
  await activity(ctx, eventId, agendaItemId, actor, legacy ? "migrated" : "attached", id); return id;
}

export const list = query({ args: { eventId: v.id("events"), cursor: v.optional(v.number()), limit: v.optional(v.number()), query: v.optional(v.string()), status: v.optional(v.string()), source: v.optional(v.string()) }, handler: async (ctx, args) => {
  await assertEventOrganizerAccess(ctx, args.eventId);
  const [sessions, rooms, tracks, speakers, recordings] = await Promise.all([ctx.db.query("agenda_items").withIndex("by_event", q => q.eq("eventId", args.eventId)).collect(), ctx.db.query("rooms").withIndex("by_event", q => q.eq("eventId", args.eventId)).collect(), ctx.db.query("tracks").withIndex("by_event", q => q.eq("eventId", args.eventId)).collect(), ctx.db.query("speakers").withIndex("by_event", q => q.eq("eventId", args.eventId)).collect(), ctx.db.query("session_recordings").withIndex("by_event", q => q.eq("eventId", args.eventId)).collect()]);
  const room = new Map(rooms.map(x => [x._id, x.name])), track = new Map(tracks.map(x => [x._id, x.name])), speaker = new Map(speakers.map(x => [x._id, `${x.firstName} ${x.lastName}`.trim()])); const needle = args.query?.trim().toLowerCase();
  const rows = sessions.sort((a,b) => a.startTime-b.startTime).map(item => { const all = recordings.filter(x => x.agendaItemId === item._id); const active = all.find(x => x.role === "active"); const replacement = all.find(x => x.role === "replacement"); return { ...item, roomName: room.get(item.roomId) ?? "Room to be announced", trackName: item.trackId ? track.get(item.trackId) : undefined, speakerNames: item.speakerIds.map(id => speaker.get(id)).filter((value): value is string => Boolean(value)), recording: active ? { id: active._id, sourceType: active.sourceType, fileName: active.fileName, publicationStatus: active.publicationStatus, updatedAt: active.updatedAt, provider: active.provider, availability: active.availability, failureReason: active.failureReason } : undefined, replacement: replacement ? { id: replacement._id, sourceType: replacement.sourceType, fileName: replacement.fileName, updatedAt: replacement.updatedAt, provider: replacement.provider, availability: replacement.availability, failureReason: replacement.failureReason } : undefined }; }).filter(row => !needle || `${row.title} ${row.speakerNames.join(" ")}`.toLowerCase().includes(needle)).filter(row => !args.status ? true : args.status === "missing" ? !row.recording : args.status === "replacement" ? Boolean(row.replacement) : row.recording?.publicationStatus === args.status).filter(row => !args.source || row.recording?.sourceType === args.source);
  const start = args.cursor ?? 0, limit = Math.min(args.limit ?? 100, 100); return rows.slice(start, start + limit);
} });
// The manager consumes this cursor-backed path. `list` remains temporarily for the existing
// Readiness projection, which needs the full event coverage set rather than an interactive page.
const managerStatusValidator = v.union(v.literal("all"), v.literal("missing"), v.literal("draft"), v.literal("published"), v.literal("replacement"), v.literal("unavailable"));
const managerSourceValidator = v.union(v.literal("all"), v.literal("upload"), v.literal("asset"), v.literal("hosted"));
const managerSortValidator = v.union(v.literal("schedule_asc"), v.literal("schedule_desc"));

function managerDayKey(value: number, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

type ManagerCursorState = { recordingManagerCursor: 1; agendaCursor: string | null; agendaDone: boolean; bufferedAgendaItemIds: string[] };
function managerCursor(cursor: string | null): ManagerCursorState {
  if (!cursor) return { recordingManagerCursor: 1, agendaCursor: null, agendaDone: false, bufferedAgendaItemIds: [] };
  try {
    const parsed = JSON.parse(cursor) as Partial<ManagerCursorState>;
    if (parsed.recordingManagerCursor === 1 && typeof parsed.agendaCursor !== "undefined" && typeof parsed.agendaDone === "boolean" && Array.isArray(parsed.bufferedAgendaItemIds) && parsed.bufferedAgendaItemIds.every(id => typeof id === "string")) {
      return { recordingManagerCursor: 1, agendaCursor: parsed.agendaCursor ?? null, agendaDone: parsed.agendaDone, bufferedAgendaItemIds: parsed.bufferedAgendaItemIds.slice(0, 500) };
    }
  } catch { /* Existing native Convex cursors are treated as the agenda cursor below. */ }
  return { recordingManagerCursor: 1, agendaCursor: cursor, agendaDone: false, bufferedAgendaItemIds: [] };
}

// This intentionally resolves only a bounded agenda page. The returned cursor belongs to the
// indexed agenda query, while search/status/source filtering is performed server-side before
// the manager receives rows. Playback URLs remain exclusive to the session detail query.
export const listPage = query({ args: {
  eventId: v.id("events"),
  paginationOpts: paginationOptsValidator,
  query: v.optional(v.string()),
  status: v.optional(managerStatusValidator),
  source: v.optional(managerSourceValidator),
  roomId: v.optional(v.id("rooms")),
  trackId: v.optional(v.id("tracks")),
  day: v.optional(v.string()),
  timeZone: v.optional(v.string()),
  sort: v.optional(managerSortValidator),
}, handler: async (ctx, args) => {
  await assertEventOrganizerAccess(ctx, args.eventId);
  const order = args.sort === "schedule_desc" ? "desc" : "asc";
  const agendaQuery = () => args.roomId
    ? ctx.db.query("agenda_items").withIndex("by_event_room_startTime", q => q.eq("eventId", args.eventId).eq("roomId", args.roomId!))
    : args.trackId
      ? ctx.db.query("agenda_items").withIndex("by_event_track_startTime", q => q.eq("eventId", args.eventId).eq("trackId", args.trackId!))
      : ctx.db.query("agenda_items").withIndex("by_event_startTime", q => q.eq("eventId", args.eventId));
  const needle = args.query?.trim().toLowerCase();
  const timeZone = args.timeZone || "UTC";
  const matches = async (item: Doc<"agenda_items">) => {
    const [room, track, speakers, recordings] = await Promise.all([
      ctx.db.get(item.roomId),
      item.trackId ? ctx.db.get(item.trackId) : Promise.resolve(undefined),
      Promise.all(item.speakerIds.map(id => ctx.db.get(id))),
      ctx.db.query("session_recordings").withIndex("by_event_and_agenda_item", q => q.eq("eventId", args.eventId).eq("agendaItemId", item._id)).collect(),
    ]);
    const active = recordings.find(recording => recording.role === "active");
    const replacement = recordings.find(recording => recording.role === "replacement");
    const row = {
      ...item,
      roomName: room?.name ?? "Room to be announced",
      trackName: track?.name,
      speakerNames: speakers.flatMap(speaker => speaker ? [`${speaker.firstName} ${speaker.lastName}`.trim()] : []),
      ...(active ? { recording: { id: active._id, sourceType: active.sourceType, fileName: active.fileName, publicationStatus: active.publicationStatus, updatedAt: active.updatedAt, provider: active.provider, availability: active.availability, failureReason: active.failureReason } } : {}),
      ...(replacement ? { replacement: { id: replacement._id, sourceType: replacement.sourceType, fileName: replacement.fileName, updatedAt: replacement.updatedAt, provider: replacement.provider, availability: replacement.availability, failureReason: replacement.failureReason } } : {}),
    };
    const speakerText = row.speakerNames.join(" ").toLowerCase();
    const matchesQuery = !needle || `${row.title} ${speakerText}`.toLowerCase().includes(needle);
    const matchesStatus = !args.status || args.status === "all"
      || (args.status === "missing" && !row.recording)
      || (args.status === "replacement" && Boolean(row.replacement))
      || (args.status === "unavailable" && row.recording?.availability === "unavailable")
      || (args.status === "draft" && row.recording?.publicationStatus === "draft")
      || (args.status === "published" && row.recording?.publicationStatus === "published");
    const matchesSource = !args.source || args.source === "all" || row.recording?.sourceType === args.source;
    const matchesTrack = !args.trackId || item.trackId === args.trackId;
    const matchesDay = !args.day || managerDayKey(item.startTime, timeZone) === args.day;
    return matchesQuery && matchesStatus && matchesSource && matchesTrack && matchesDay ? row : undefined;
  };

  // Lifecycle/source criteria live on session_recordings, so they cannot be expressed by an
  // agenda index alone. Convex permits one paginate call per query. We therefore carry any
  // matching overfetch rows forward as IDs in the opaque manager cursor, preventing both sparse
  // pages and skipped matching rows on the following page.
  const state = managerCursor(args.paginationOpts.cursor);
  const selected: Array<NonNullable<Awaited<ReturnType<typeof matches>>>> = [];
  const buffered: string[] = [];
  const appendMatches = async (items: Doc<"agenda_items">[]) => {
    const candidateRows = await Promise.all(items.map(async item => ({ item, row: await matches(item) })));
    for (const candidate of candidateRows) {
      if (!candidate.row) continue;
      if (selected.length < args.paginationOpts.numItems) selected.push(candidate.row);
      else buffered.push(candidate.item._id);
    }
  };
  if (state.bufferedAgendaItemIds.length) {
    const items = await Promise.all(state.bufferedAgendaItemIds.map(id => ctx.db.get(id as Id<"agenda_items">)));
    await appendMatches(items.filter((item): item is Doc<"agenda_items"> => Boolean(item && item.eventId === args.eventId)));
  }
  if (selected.length < args.paginationOpts.numItems && !state.agendaDone) {
    const page = await agendaQuery().order(order).paginate({
      cursor: state.agendaCursor,
      numItems: Math.min(Math.max(args.paginationOpts.numItems * 10, args.paginationOpts.numItems), 500),
    });
    state.agendaCursor = page.continueCursor;
    state.agendaDone = page.isDone;
    await appendMatches(page.page);
  }
  const isDone = state.agendaDone && buffered.length === 0;
  return {
    page: selected,
    isDone,
    continueCursor: isDone ? "" : JSON.stringify({ ...state, bufferedAgendaItemIds: buffered }),
  };
} });
export const get = query({ args: { eventId: v.id("events"), agendaItemId: v.id("agenda_items") }, handler: async (ctx,args) => { await assertEventOrganizerAccess(ctx,args.eventId); const item=await session(ctx,args.eventId,args.agendaItemId); const rows=await ctx.db.query("session_recordings").withIndex("by_event_and_agenda_item",q=>q.eq("eventId",args.eventId).eq("agendaItemId",args.agendaItemId)).collect(); const history=await ctx.db.query("recording_activity").withIndex("by_event_createdAt",q=>q.eq("eventId",args.eventId)).order("desc").take(100); return { session:item, recordings:await Promise.all(rows.map(async row=>({...row,sourceUrl:await sourceUrl(ctx,row),embedUrl:row.sourceType==="hosted"&&row.hostedUrl?hostedSource(row.hostedUrl).embedUrl:undefined}))), history:history.filter(x=>x.agendaItemId===args.agendaItemId) }; } });
export const listAssets = query({ args: { eventId: v.id("events") }, handler: async (ctx, args) => { await assertEventOrganizerAccess(ctx, args.eventId); return ctx.db.query("event_assets").withIndex("by_event", q => q.eq("eventId", args.eventId)).order("desc").take(200); } });
export const requestUpload = mutation({ args: { eventId: v.id("events"), agendaItemId: v.id("agenda_items") }, handler: async (ctx, args) => { await assertEventOrganizerAccess(ctx, args.eventId); await session(ctx, args.eventId, args.agendaItemId); return { uploadUrl: await ctx.storage.generateUploadUrl() }; } });
export const attachHosted = mutation({ args:{eventId:v.id("events"),agendaItemId:v.id("agenda_items"),hostedUrl:v.string()}, handler:async(ctx,args)=>{const identity=await assertEventOrganizerAccess(ctx,args.eventId);await session(ctx,args.eventId,args.agendaItemId);const host=hostedSource(args.hostedUrl);return attach(ctx,args.eventId,args.agendaItemId,identity.subject,{sourceType:"hosted" as const,hostedUrl:host.url,provider:host.provider});} });
export const completeUpload = mutation({ args:{eventId:v.id("events"),agendaItemId:v.id("agenda_items"),storageId:v.id("_storage"),fileName:v.string()}, handler:async(ctx,args)=>{const identity=await assertEventOrganizerAccess(ctx,args.eventId);await session(ctx,args.eventId,args.agendaItemId);const meta=await ctx.storage.getMetadata(args.storageId);if(!meta?.contentType?.startsWith("video/"))throw new Error("Upload a supported video file.");if(meta.size>250*1024*1024)throw new Error("Video uploads must be 250 MB or smaller.");const now=Date.now();let asset=await ctx.db.query("event_assets").withIndex("by_storage",q=>q.eq("storageId",args.storageId)).first();if(!asset){const id=await ctx.db.insert("event_assets",{eventId:args.eventId,kind:"video",storageId:args.storageId,fileName:args.fileName.trim().slice(0,255),mimeType:meta.contentType,sizeBytes:meta.size,createdByUserId:identity.subject,createdAt:now,updatedAt:now});asset=await ctx.db.get(id);}if(!asset||asset.eventId!==args.eventId)throw new Error("Upload does not belong to this event.");return attach(ctx,args.eventId,args.agendaItemId,identity.subject,{sourceType:"upload" as const,assetId:asset._id,fileName:asset.fileName,provider:"convex" as const});} });
export const attachUpload = completeUpload;
export const attachAsset = mutation({args:{eventId:v.id("events"),agendaItemId:v.id("agenda_items"),assetId:v.id("event_assets")},handler:async(ctx,args)=>{const identity=await assertEventOrganizerAccess(ctx,args.eventId);await session(ctx,args.eventId,args.agendaItemId);const asset=await ctx.db.get(args.assetId);if(!asset||asset.eventId!==args.eventId)throw new Error("Video asset not found for this event.");return attach(ctx,args.eventId,args.agendaItemId,identity.subject,{sourceType:"asset" as const,assetId:asset._id,fileName:asset.fileName,provider:"convex" as const});}});
async function publishOne(ctx:MutationCtx,eventId:Id<"events">,recordingId:Id<"session_recordings">,actor:string,overrideReason?:string){const row=await ctx.db.get(recordingId);if(!row||row.eventId!==eventId)throw new Error("Recording not found for this event.");const item=await session(ctx,eventId,row.agendaItemId);const early=item.endTime>Date.now();if(early&&!overrideReason?.trim())throw new Error("This session has not ended. Add an override reason to publish early.");if(row.availability!=="ready")throw new Error(row.failureReason ?? "This recording is not ready to publish.");const now=Date.now();if(row.role==="replacement"){const active=await ctx.db.query("session_recordings").withIndex("by_agenda_item_role",q=>q.eq("agendaItemId",row.agendaItemId).eq("role","active")).first();if(active?.eventId===eventId)await ctx.db.patch(active._id,{role:"replaced",publicationStatus:"draft",replacedAt:now,replacedByRecordingId:row._id,publishedAt:undefined,publishedByUserId:undefined,updatedAt:now});await ctx.db.patch(row._id,{role:"active",publicationStatus:"published",publishedAt:now,publishedByUserId:actor,updatedAt:now});await activity(ctx,eventId,row.agendaItemId,actor,"replaced",row._id);if(early)await activity(ctx,eventId,row.agendaItemId,actor,"published_early",row._id,overrideReason?.trim());return row._id;}await ctx.db.patch(row._id,{publicationStatus:"published",publishedAt:now,publishedByUserId:actor,updatedAt:now});await activity(ctx,eventId,row.agendaItemId,actor,early?"published_early":"published",row._id,overrideReason?.trim());return row._id;}
export const publish=mutation({args:{eventId:v.id("events"),recordingId:v.id("session_recordings"),overrideReason:v.optional(v.string())},handler:async(ctx,args)=>publishOne(ctx,args.eventId,args.recordingId,(await assertEventOrganizerAccess(ctx,args.eventId)).subject,args.overrideReason)});
export const unpublish=mutation({args:{eventId:v.id("events"),recordingId:v.id("session_recordings")},handler:async(ctx,args)=>{const actor=(await assertEventOrganizerAccess(ctx,args.eventId)).subject;const row=await ctx.db.get(args.recordingId);if(!row||row.eventId!==args.eventId)throw new Error("Recording not found for this event.");await ctx.db.patch(row._id,{publicationStatus:"draft",publishedAt:undefined,publishedByUserId:undefined,updatedAt:Date.now()});await activity(ctx,args.eventId,row.agendaItemId,actor,"unpublished",row._id);}});
export const detach=mutation({args:{eventId:v.id("events"),recordingId:v.id("session_recordings")},handler:async(ctx,args)=>{const actor=(await assertEventOrganizerAccess(ctx,args.eventId)).subject;const row=await ctx.db.get(args.recordingId);if(!row||row.eventId!==args.eventId)throw new Error("Recording not found for this event.");if(row.publicationStatus==="published")throw new Error("Unpublish this recording before detaching it.");await ctx.db.delete(row._id);await activity(ctx,args.eventId,row.agendaItemId,actor,"detached");}});
export const retry = mutation({ args: { eventId: v.id("events"), recordingId: v.id("session_recordings") }, handler: async (ctx, args) => { const actor = (await assertEventOrganizerAccess(ctx, args.eventId)).subject; const row = await ctx.db.get(args.recordingId); if (!row || row.eventId !== args.eventId) throw new Error("Recording not found for this event."); await ctx.db.patch(row._id, { availability: "ready", updatedAt: Date.now() }); await activity(ctx, args.eventId, row.agendaItemId, actor, "retried", row._id, "Recording availability retried."); return row._id; } });
export const bulkPublish=mutation({args:{eventId:v.id("events"),recordingIds:v.array(v.id("session_recordings")),overrideReason:v.optional(v.string())},handler:async(ctx,args)=>{const actor=(await assertEventOrganizerAccess(ctx,args.eventId)).subject;const results=[] as Array<{recordingId:Id<"session_recordings">;status:"published"|"failed";error?:string}>;for(const id of [...new Set(args.recordingIds)].slice(0,50)){try{await publishOne(ctx,args.eventId,id,actor,args.overrideReason);results.push({recordingId:id,status:"published"});}catch(error){results.push({recordingId:id,status:"failed",error:error instanceof Error?error.message:"Could not publish."});}}return results;}});
export const bulkUnpublish=mutation({args:{eventId:v.id("events"),recordingIds:v.array(v.id("session_recordings"))},handler:async(ctx,args)=>{const actor=(await assertEventOrganizerAccess(ctx,args.eventId)).subject;const results=[] as Array<{recordingId:Id<"session_recordings">;status:"unpublished"|"failed";error?:string}>;for(const id of [...new Set(args.recordingIds)].slice(0,50)){try{const row=await ctx.db.get(id);if(!row||row.eventId!==args.eventId)throw new Error("Recording not found for this event.");await ctx.db.patch(id,{publicationStatus:"draft",publishedAt:undefined,publishedByUserId:undefined,updatedAt:Date.now()});await activity(ctx,args.eventId,row.agendaItemId,actor,"unpublished",id);results.push({recordingId:id,status:"unpublished"});}catch(error){results.push({recordingId:id,status:"failed",error:error instanceof Error?error.message:"Could not unpublish."});}}return results;}});
export const migrateLegacy=mutation({args:{eventId:v.id("events")},handler:async(ctx,args)=>{const actor=(await assertEventOrganizerAccess(ctx,args.eventId)).subject;const sessions=await ctx.db.query("agenda_items").withIndex("by_event",q=>q.eq("eventId",args.eventId)).collect();let created=0,skipped=0,invalid=0;const exceptions=[] as Array<{agendaItemId:Id<"agenda_items">;title:string;value:string;reason:string}>;for(const item of sessions){if(!item.videoUrl)continue;let source;try{source=hostedSource(item.videoUrl);}catch(error){invalid++;exceptions.push({agendaItemId:item._id,title:item.title,value:item.videoUrl,reason:error instanceof Error?error.message:"Enter a valid HTTPS recording URL."});continue;}const exists=await ctx.db.query("session_recordings").withIndex("by_agenda_item",q=>q.eq("agendaItemId",item._id)).collect();if(exists.some(x=>x.legacySource==="agenda_video_url"&&x.hostedUrl===source.url)){skipped++;continue;}await attach(ctx,args.eventId,item._id,actor,{sourceType:"hosted" as const,hostedUrl:source.url,provider:source.provider},true);created++;}return{created,skipped,invalid,exceptions:exceptions.slice(0,100)};}});
export const cleanupUnusedAssets = internalMutation({ args: {}, handler: async (ctx) => { const cutoff = Date.now() - 24 * 60 * 60 * 1000; const assets = await ctx.db.query("event_assets").withIndex("by_createdAt", q => q.lt("createdAt", cutoff)).take(500); let deleted = 0; for (const asset of assets) { const reference = await ctx.db.query("session_recordings").withIndex("by_asset", q => q.eq("assetId", asset._id)).first(); if (reference) continue; await ctx.storage.delete(asset.storageId); await ctx.db.delete(asset._id); deleted++; } return { deleted }; } });

// Internal-only companion for the re-runnable demo seed. The Node action owns the actual
// storage write; this mutation atomically creates one reusable asset and attaches it to two
// dedicated sessions without ever manufacturing a storage id.
export const attachDemoDirectUploadFixtures = internalMutation({
  args: { eventId: v.id("events"), draftAgendaItemId: v.id("agenda_items"), publishedAgendaItemId: v.id("agenda_items"), storageId: v.id("_storage"), mimeType: v.string(), sizeBytes: v.number() },
  returns: v.object({ draftRecordingId: v.id("session_recordings"), publishedRecordingId: v.id("session_recordings") }),
  handler: async (ctx, args) => {
    const [draftSession, publishedSession] = await Promise.all([
      session(ctx, args.eventId, args.draftAgendaItemId),
      session(ctx, args.eventId, args.publishedAgendaItemId),
    ]);
    if (!args.mimeType.startsWith("video/") || args.sizeBytes <= 0 || args.sizeBytes > 250 * 1024 * 1024) throw new Error("The seeded recording fixture is not a supported video.");
    const now = Date.now();
    let asset = await ctx.db.query("event_assets").withIndex("by_storage", q => q.eq("storageId", args.storageId)).first();
    if (!asset) {
      const assetId = await ctx.db.insert("event_assets", { eventId: args.eventId, kind: "video", storageId: args.storageId, fileName: "seed-direct-recording.mp4", mimeType: args.mimeType, sizeBytes: args.sizeBytes, createdByUserId: "system:seed", createdAt: now, updatedAt: now });
      asset = await ctx.db.get(assetId);
    }
    if (!asset || asset.eventId !== args.eventId) throw new Error("Seeded upload asset belongs to a different event.");
    const attachFixture = async (item: Doc<"agenda_items">, publicationStatus: "draft" | "published") => {
      const existing = await ctx.db.query("session_recordings").withIndex("by_event_and_agenda_item", q => q.eq("eventId", args.eventId).eq("agendaItemId", item._id)).take(3);
      const active = existing.find(recording => recording.role === "active");
      if (active) return active._id;
      const recordingId = await ctx.db.insert("session_recordings", { eventId: args.eventId, agendaItemId: item._id, sourceType: "upload", assetId: asset._id, fileName: asset.fileName, provider: "convex", availability: "ready", role: "active", publicationStatus, ...(publicationStatus === "published" ? { publishedAt: now, publishedByUserId: "system:seed" } : {}), createdByUserId: "system:seed", createdAt: now, updatedAt: now });
      await activity(ctx, args.eventId, item._id, "system:seed", "attached", recordingId, "Seeded direct Convex upload.");
      if (publicationStatus === "published") await activity(ctx, args.eventId, item._id, "system:seed", "published", recordingId, "Seeded published direct Convex upload.");
      return recordingId;
    };
    return { draftRecordingId: await attachFixture(draftSession, "draft"), publishedRecordingId: await attachFixture(publishedSession, "published") };
  },
});
