import { v } from "convex/values";
import { query, internalQuery } from "./_generated/server";
import { assertEventOrganizerAccess, mutation } from "./functions";
import { publicFeedProjection } from "./publicEmbeds";

const format = v.union(v.literal("html"), v.literal("basic_html"), v.literal("json"), v.literal("xml"), v.literal("ical"));
const newToken = () => crypto.randomUUID().replace(/-/g, "");

export const list = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const rows = await ctx.db.query("public_feeds").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).collect();
    return rows.filter((row) => !row.revokedAt).map((row) => ({ ...row, token: row.token ?? row._id }));
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
    return ctx.db.insert("public_feeds", { ...values, token: newToken(), createdAt: now });
  },
});

export const remove = mutation({
  args: { eventId: v.id("events"), feedId: v.id("public_feeds") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const feed = await ctx.db.get(args.feedId);
    if (!feed || feed.eventId !== args.eventId) throw new Error("Feed not found.");
    const now = Date.now();
    await ctx.db.patch(args.feedId, { enabled: false, revokedAt: now, updatedAt: now });
  },
});

export const duplicate = mutation({
  args: { eventId: v.id("events"), feedId: v.id("public_feeds") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAccess(ctx, args.eventId);
    const feed = await ctx.db.get(args.feedId);
    if (!feed || feed.eventId !== args.eventId) throw new Error("Feed not found.");
    const now = Date.now();
    return ctx.db.insert("public_feeds", { eventId: feed.eventId, embedId: feed.embedId, name: `${feed.name} copy`.slice(0, 80), format: feed.format, enabled: false, token: newToken(), createdAt: now, updatedAt: now });
  },
});

export const getPublic = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const byToken = await ctx.db.query("public_feeds").withIndex("by_token", (q) => q.eq("token", args.token)).unique();
    const legacyId = byToken ? null : ctx.db.normalizeId("public_feeds", args.token);
    const feed = byToken ?? (legacyId ? await ctx.db.get(legacyId) : null);
    if (!feed?.enabled || feed.revokedAt) return null;
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

type PublicFeedSession = {
  key: string;
  title: string;
  startTime?: number;
  endTime?: number;
  roomName?: string;
  trackName?: string;
};

type PublicFeedProjection = {
  event: { name: string; timezone: string };
  sessions: PublicFeedSession[];
  [key: string]: unknown;
};

export function renderPublicFeed(payload: { format: "html" | "basic_html" | "json" | "xml" | "ical"; projection: PublicFeedProjection }) {
  const { format, projection } = payload;
  if (format === "json") return { body: JSON.stringify(projection), contentType: "application/json; charset=utf-8" };
  if (format === "html" || format === "basic_html") {
    const items = projection.sessions.map((item) => `<li><strong>${escape(item.title)}</strong>${item.startTime ? ` <time datetime="${new Date(item.startTime).toISOString()}">${escape(new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: projection.event.timezone }).format(item.startTime))}</time>` : ""}${item.roomName ? ` <span>${escape(item.roomName)}</span>` : ""}</li>`).join("");
    const styles = format === "html" ? `<style>:root{color-scheme:light dark}body{margin:0;background:#f6f7f9;color:#18202b;font:15px/1.5 system-ui,sans-serif}main{max-width:70rem;margin:auto;padding:2rem}h1{font-size:1.75rem}ul{display:grid;gap:.75rem;padding:0;list-style:none}li{display:grid;gap:.2rem;border:1px solid #dfe3e8;border-radius:.6rem;background:white;padding:1rem}time,span{color:#5b6573;font-size:.9rem}@media(prefers-color-scheme:dark){body{background:#101317;color:#f4f6f8}li{background:#181d23;border-color:#303740}time,span{color:#aeb7c2}}</style>` : "";
    return { body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(projection.event.name)}</title>${styles}</head><body><main><h1>${escape(projection.event.name)}</h1><ul>${items}</ul></main></body></html>`, contentType: "text/html; charset=utf-8" };
  }
  if (format === "xml") {
    const items = projection.sessions.map((item) => `<session>${xml("title", item.title)}${item.startTime !== undefined ? xml("start", new Date(item.startTime).toISOString()) : ""}${item.endTime !== undefined ? xml("end", new Date(item.endTime).toISOString()) : ""}${xml("room", item.roomName)}${item.trackName ? xml("track", item.trackName) : ""}</session>`).join("");
    return { body: `<?xml version="1.0" encoding="UTF-8"?><event>${xml("name", projection.event.name)}<sessions>${items}</sessions></event>`, contentType: "application/xml; charset=utf-8" };
  }
  const events = projection.sessions.map((item) => `BEGIN:VEVENT\r\nUID:${icalText(item.key)}@namos-sessions\r\n${item.startTime !== undefined ? `DTSTART:${date(item.startTime)}\r\n` : ""}${item.endTime !== undefined ? `DTEND:${date(item.endTime)}\r\n` : ""}SUMMARY:${icalText(item.title)}\r\nLOCATION:${icalText(item.roomName)}\r\nEND:VEVENT`).join("\r\n");
  return { body: `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Namos Sessions//EN\r\n${events}\r\nEND:VCALENDAR\r\n`, contentType: "text/calendar; charset=utf-8" };
}
