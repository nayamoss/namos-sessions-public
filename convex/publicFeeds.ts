import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import { assertEventOrganizerAccess } from "./functions";
import { publicFeedProjection } from "./publicEmbeds";

const format = v.union(v.literal("html"), v.literal("json"), v.literal("xml"), v.literal("ical"));

export const list = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    return ctx.db.query("public_feeds").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect();
  },
});

export const save = mutation({
  args: { id: v.optional(v.id("public_feeds")), eventId: v.id("events"), embedId: v.id("embeds"), name: v.string(), format, enabled: v.boolean() },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const [embed, existing] = await Promise.all([ctx.db.get(args.embedId), args.id ? ctx.db.get(args.id) : null]);
    if (!embed || embed.eventId !== args.eventId) throw new Error("Choose an embed from this event.");
    if (existing && existing.eventId !== args.eventId) throw new Error("Feed not found.");
    const name = args.name.trim();
    if (!name || name.length > 80) throw new Error("Feed name must be between 1 and 80 characters.");
    const now = Date.now();
    const values = { eventId: args.eventId, embedId: args.embedId, name, format: args.format, enabled: args.enabled, updatedAt: now };
    if (args.id) { await ctx.db.patch(args.id, values); return args.id; }
    return ctx.db.insert("public_feeds", { ...values, createdAt: now });
  },
});

export const remove = mutation({
  args: { eventId: v.id("events"), feedId: v.id("public_feeds") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const feed = await ctx.db.get(args.feedId);
    if (!feed || feed.eventId !== args.eventId) throw new Error("Feed not found.");
    await ctx.db.delete(args.feedId);
  },
});

export const getPublic = internalQuery({
  args: { feedId: v.string() },
  handler: async (ctx, args) => {
    const feedId = ctx.db.normalizeId("public_feeds", args.feedId);
    if (!feedId) return null;
    const feed = await ctx.db.get(feedId);
    if (!feed?.enabled) return null;
    const embed = await ctx.db.get(feed.embedId);
    if (!embed || !embed.enabled || embed.eventId !== feed.eventId) return null;
    const projection = await publicFeedProjection(ctx, feed.eventId, embed, true);
    return projection ? { format: feed.format, projection } : null;
  },
});

const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
const xml = (name: string, value: unknown) => `<${name}>${escape(value)}</${name}>`;
const icalText = (value: unknown) => String(value ?? "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, "\\$&");
const date = (value: number) => new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function renderPublicFeed(payload: { format: "html" | "json" | "xml" | "ical"; projection: any }) {
  const { format, projection } = payload;
  if (format === "json") return { body: JSON.stringify(projection), contentType: "application/json; charset=utf-8" };
  if (format === "html") {
    const items = projection.agenda.map((item: any) => `<li><strong>${escape(item.title)}</strong>${item.startTime ? ` <time datetime="${new Date(item.startTime).toISOString()}">${escape(new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: projection.eventTimezone }).format(item.startTime))}</time>` : ""}${item.roomName ? ` <span>${escape(item.roomName)}</span>` : ""}</li>`).join("");
    return { body: `<!doctype html><html><head><meta charset="utf-8"><title>${escape(projection.eventName)}</title></head><body><main><h1>${escape(projection.eventName)}</h1><ul>${items}</ul></main></body></html>`, contentType: "text/html; charset=utf-8" };
  }
  if (format === "xml") {
    const items = projection.agenda.map((item: any) => `<session>${xml("title", item.title)}${xml("start", new Date(item.startTime).toISOString())}${xml("end", new Date(item.endTime).toISOString())}${xml("room", item.roomName)}${item.trackName ? xml("track", item.trackName) : ""}</session>`).join("");
    return { body: `<?xml version="1.0" encoding="UTF-8"?><event>${xml("name", projection.eventName)}<sessions>${items}</sessions></event>`, contentType: "application/xml; charset=utf-8" };
  }
  const events = projection.agenda.map((item: any) => `BEGIN:VEVENT\r\nUID:${icalText(item.sessionKey)}@namos-sessions\r\nDTSTART:${date(item.startTime)}\r\nDTEND:${date(item.endTime)}\r\nSUMMARY:${icalText(item.title)}\r\nLOCATION:${icalText(item.roomName)}\r\nEND:VEVENT`).join("\r\n");
  return { body: `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Namos Sessions//EN\r\n${events}\r\nEND:VCALENDAR\r\n`, contentType: "text/calendar; charset=utf-8" };
}
