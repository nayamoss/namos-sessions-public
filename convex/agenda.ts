import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, assertEventAccess, assertEventOrganizerAccess } from "./functions";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { recordAgendaItemAudit } from "./agendaAudit";
import { assertOrganizerOrOwnsSpeaker } from "./speakers";

const agendaItemFields = {
  eventId: v.id("events"),
  submissionId: v.optional(v.id("submissions")),
  title: v.string(),
  roomId: v.id("rooms"),
  trackId: v.optional(v.id("tracks")),
  startTime: v.number(),
  endTime: v.number(),
  speakerIds: v.array(v.id("speakers")),
  videoUrl: v.optional(v.string()),
  locationDetails: v.optional(v.string()),
  isPublished: v.boolean(),
};

type ConflictReason = "room_overlap" | "speaker_overlap" | "speaker_unavailable" | "track_overlap";
type PlacementConflict = { reason: ConflictReason; blocking: boolean; message: string };
type PlacementInput = {
  id?: Id<"agenda_items">;
  eventId: Id<"events">;
  roomId: Id<"rooms">;
  trackId?: Id<"tracks">;
  startTime: number;
  endTime: number;
  speakerIds: Id<"speakers">[];
};

function isPublishedAgendaItem<T extends { isPublished: boolean }>(item: T) {
  return item.isPublished;
}

function rangesOverlap(
  first: { startTime: number; endTime: number },
  second: { startTime: number; endTime: number },
) {
  return first.startTime < second.endTime && second.startTime < first.endTime;
}

export function conflictRows<T extends { _id: unknown; roomId: unknown; trackId?: unknown; speakerIds: unknown[]; startTime: number; endTime: number }>(items: T[]) {
  const conflicts: { itemA: T["_id"]; itemB: T["_id"]; reason: ConflictReason }[] = [];

  for (let index = 0; index < items.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < items.length; nextIndex += 1) {
      const first = items[index];
      const second = items[nextIndex];
      if (!rangesOverlap(first, second)) continue;

      if (first.roomId === second.roomId) {
        conflicts.push({
          itemA: first._id,
          itemB: second._id,
          reason: "room_overlap",
        });
      }
      if (
        first.speakerIds.some((speakerId) =>
          second.speakerIds.includes(speakerId),
        )
      ) {
        conflicts.push({
          itemA: first._id,
          itemB: second._id,
          reason: "speaker_overlap",
        });
      }
      if (first.trackId !== undefined && first.trackId === second.trackId) {
        conflicts.push({ itemA: first._id, itemB: second._id, reason: "track_overlap" });
      }
    }
  }

  return conflicts;
}

function unavailableSlotKeys(
  startTime: number,
  endTime: number,
  timeZone: string,
) {
  const values = new Set<string>();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    hourCycle: "h23",
  });
  for (let cursor = startTime; cursor < endTime; cursor += 30 * 60_000) {
    const parts = formatter.formatToParts(cursor);
    const number = (type: string) =>
      Number(parts.find((part) => part.type === type)?.value);
    const hour = number("hour");
    const date = Date.UTC(number("year"), number("month") - 1, number("day"));
    values.add(`${date}:hour:${hour}`);
    values.add(`${date}:part:${hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"}`);
  }
  return values;
}

async function placementConflicts(
  ctx: QueryCtx | MutationCtx,
  args: PlacementInput,
) : Promise<PlacementConflict[]> {
  const [items, event, availability] = await Promise.all([
    ctx.db.query("agenda_items").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
    ctx.db.get(args.eventId),
    ctx.db.query("speaker_availability").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
  ]);
  const candidate = { _id: "candidate", roomId: args.roomId, trackId: args.trackId, speakerIds: [...new Set(args.speakerIds)], startTime: args.startTime, endTime: args.endTime };
  const overlapRows = conflictRows([...items.filter((item) => item._id !== args.id), candidate]);
  const results: PlacementConflict[] = overlapRows
    .filter((row) => row.itemA === "candidate" || row.itemB === "candidate")
    .map((row) => ({
      reason: row.reason,
      blocking: row.reason === "room_overlap" || row.reason === "speaker_overlap",
      message: row.reason === "room_overlap" ? "That room already has a session at this time."
        : row.reason === "speaker_overlap" ? "A speaker is already booked at this time."
          : "This track overlaps another session.",
    }));
  const eventDoc = event as Doc<"events"> | null;
  if (!eventDoc) return results;
  const blocked = unavailableSlotKeys(args.startTime, args.endTime, eventDoc.timezone);
  for (const speakerId of candidate.speakerIds) {
    const record = availability.find((entry) => entry.speakerId === speakerId);
    if (record?.unavailable.some((entry) => entry.hour !== undefined
      ? blocked.has(`${entry.date}:hour:${entry.hour}`)
      : entry.part !== undefined && blocked.has(`${entry.date}:part:${entry.part}`))) {
      results.push({ reason: "speaker_unavailable", blocking: false, message: "This speaker is marked unavailable at this time." });
    }
  }
  return results;
}

export const list = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventAccess(ctx, args.eventId);
    return ctx.db
      .query("agenda_items")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
  },
});

// Internal publishing integrations reuse this single agenda trust boundary instead of
// reimplementing `isPublished` filtering in an external-service action.
export const listPublishedInternal = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("agenda_items")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    return items.filter(isPublishedAgendaItem);
  },
});

// The speaker portal uses a deliberately narrow projection so speakers can only read their
// own published sessions without requiring organizer access to the entire event schedule.
export const listForSpeaker = query({
  args: { eventId: v.id("events"), speakerId: v.id("speakers") },
  handler: async (ctx, args) => {
    await assertOrganizerOrOwnsSpeaker(ctx, args.eventId, args.speakerId);
    const [items, rooms, tracks] = await Promise.all([
      ctx.db.query("agenda_items").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
      ctx.db.query("rooms").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
      ctx.db.query("tracks").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect(),
    ]);
    const roomNames = new Map(rooms.map((room) => [room._id, room.name]));
    const trackNames = new Map(tracks.map((track) => [track._id, track.name]));
    return items
      .filter((item) => isPublishedAgendaItem(item) && item.speakerIds.includes(args.speakerId))
      .map((item) => ({
        ...item,
        roomName: roomNames.get(item.roomId) ?? "Room to be announced",
        trackName: item.trackId ? trackNames.get(item.trackId) : undefined,
      }));
  },
});

export const get = query({
  args: { eventId: v.id("events"), id: v.id("agenda_items") },
  handler: async (ctx, args) => {
    await assertEventAccess(ctx, args.eventId);
    const item = await ctx.db.get(args.id);
    return item?.eventId === args.eventId ? item : null;
  },
});

export const detectConflicts = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventAccess(ctx, args.eventId);
    const [items, event, availability] = await Promise.all([
      ctx.db
        .query("agenda_items")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect(),
      ctx.db.get(args.eventId),
      ctx.db
        .query("speaker_availability")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect(),
    ]);
    const conflicts = conflictRows(items) as {
      itemA: (typeof items)[number]["_id"];
      itemB: (typeof items)[number]["_id"];
      reason: ConflictReason;
      speakerId?: (typeof items)[number]["speakerIds"][number];
    }[];
    if (!event) return conflicts;
    for (const item of items) {
      const blocked = unavailableSlotKeys(
        item.startTime,
        item.endTime,
        event.timezone,
      );
      for (const speakerId of item.speakerIds) {
        const record = availability.find(
          (entry) => entry.speakerId === speakerId,
        );
        if (
          record?.unavailable.some((entry) =>
            entry.hour !== undefined
              ? blocked.has(`${entry.date}:hour:${entry.hour}`)
              : entry.part !== undefined && blocked.has(`${entry.date}:part:${entry.part}`),
          )
        )
          conflicts.push({
            itemA: item._id,
            itemB: item._id,
            reason: "speaker_unavailable",
            speakerId,
          });
      }
    }
    return conflicts;
  },
});

export const checkPlacement = query({
  args: { id: v.optional(v.id("agenda_items")), ...agendaItemFields },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    return placementConflicts(ctx, args);
  },
});

export const save = mutation({
  args: { id: v.optional(v.id("agenda_items")), ...agendaItemFields },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAccess(ctx, args.eventId);
    if (args.startTime >= args.endTime)
      throw new Error("An agenda item must end after it starts.");
    if (!args.title.trim()) throw new Error("An agenda item needs a title.");

    const room = await ctx.db.get(args.roomId);
    if (!room || room.eventId !== args.eventId)
      throw new Error("Select a room belonging to this event.");

    if (args.trackId) {
      const track = await ctx.db.get(args.trackId);
      if (!track || track.eventId !== args.eventId)
        throw new Error("Select a track belonging to this event.");
    }

    const speakerIds = [...new Set(args.speakerIds)];
    const speakers = await Promise.all(
      speakerIds.map((speakerId) => ctx.db.get(speakerId)),
    );
    if (
      speakers.some((speaker) => !speaker || speaker.eventId !== args.eventId)
    ) {
      throw new Error("Every scheduled speaker must belong to this event.");
    }

    const now = Date.now();
    const { id, ...fields } = args;
    const normalizedFields = {
      ...fields,
      speakerIds,
      title: fields.title.trim(),
      videoUrl: fields.videoUrl?.trim() || undefined,
      locationDetails: fields.locationDetails?.trim() || undefined,
    };
    const conflicts = await placementConflicts(ctx, { ...normalizedFields, id });
    const blocking = conflicts.filter((conflict) => conflict.blocking);
    if (blocking.length > 0)
      throw new Error(blocking[0].message);
    if (id) {
      const existing = await ctx.db.get(id);
      if (!existing || existing.eventId !== args.eventId) throw new Error("Agenda item not found for this event.");
      const calendarChanged = existing.title !== normalizedFields.title
        || existing.roomId !== normalizedFields.roomId
        || existing.startTime !== normalizedFields.startTime
        || existing.endTime !== normalizedFields.endTime
        || existing.videoUrl !== normalizedFields.videoUrl
        || existing.locationDetails !== normalizedFields.locationDetails;
      await ctx.db.patch(id, {
        ...normalizedFields,
        calendarUid: existing.calendarUid ?? `sessionboard-${id}`,
        calendarSequence: calendarChanged ? (existing.calendarSequence ?? 0) + 1 : (existing.calendarSequence ?? 0),
        updatedAt: now,
      });
      const updated = await ctx.db.get(id);
      if (!updated) throw new Error("Agenda item disappeared while saving.");
      await recordAgendaItemAudit(ctx, {
        item: updated,
        operation: "update",
        actorUserId: identity.subject,
        source: "agenda:save",
      });
      return id;
    }
    const newId = await ctx.db.insert("agenda_items", { ...normalizedFields, calendarSequence: 0, createdAt: now, updatedAt: now });
    await ctx.db.patch(newId, { calendarUid: `sessionboard-${newId}` });
    const created = await ctx.db.get(newId);
    if (!created) throw new Error("Agenda item disappeared while creating it.");
    await recordAgendaItemAudit(ctx, {
      item: created,
      operation: "create",
      actorUserId: identity.subject,
      source: "agenda:save",
    });
    return newId;
  },
});

export const remove = mutation({
  args: { eventId: v.id("events"), id: v.id("agenda_items") },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAccess(ctx, args.eventId);
    const item = await ctx.db.get(args.id);
    if (!item || item.eventId !== args.eventId)
      throw new Error("Agenda item not found for this event.");
    await recordAgendaItemAudit(ctx, {
      item,
      operation: "delete",
      actorUserId: identity.subject,
      source: "agenda:remove",
    });
    await ctx.db.delete(args.id);
  },
});

export const publishSchedule = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const identity = await assertEventOrganizerAccess(ctx, args.eventId);
    const items = await ctx.db
      .query("agenda_items")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    // Room and speaker double-bookings are hard errors: publishing them would
    // send speakers to two places at once. Track overlaps stay informational.
    const blocking = conflictRows(items).filter(
      (conflict) =>
        conflict.reason === "room_overlap" ||
        conflict.reason === "speaker_overlap",
    );
    if (blocking.length > 0)
      throw new Error(
        `Resolve ${blocking.length} scheduling ${blocking.length === 1 ? "conflict" : "conflicts"} before publishing. Two sessions share a room or a speaker at the same time.`,
      );
    const now = Date.now();
    await Promise.all(
      items
        .filter((item) => !item.isPublished)
        .map(async (item) => {
          await ctx.db.patch(item._id, { isPublished: true, updatedAt: now });
          await recordAgendaItemAudit(ctx, {
            item: { ...item, isPublished: true, updatedAt: now },
            operation: "publish",
            actorUserId: identity.subject,
            source: "agenda:publishSchedule",
          });
        }),
    );
    await ctx.db.patch(args.eventId, { programPublishedAt: now, updatedAt: now });
  },
});

export const setSanityDocId = internalMutation({
  args: { id: v.id("agenda_items"), sanityDocId: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { sanityDocId: args.sanityDocId });
  },
});
