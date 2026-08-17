import { v } from "convex/values";
import { query, assertEventOrganizerAccess } from "./functions";

// Federates the event's separate append-only logs (agenda audit, API audit, agent run
// events, comms delivery log, notifications) into one normalized, sorted activity feed.
// There's no single activity_log table — each subsystem already writes its own log, so this
// query reads all of them and merges rather than introducing a new write path/schema change.

export type ActivityCategory = "agenda" | "api" | "agent" | "comms" | "notification";

export type ActivityEntry = {
  id: string;
  category: ActivityCategory;
  action: string;
  title: string;
  detail?: string;
  actorLabel?: string;
  status?: "success" | "warning" | "error" | "info";
  createdAt: number;
};

const PER_SOURCE_LIMIT = 200;
const FEED_LIMIT = 300;

export const list = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args): Promise<ActivityEntry[]> => {
    await assertEventOrganizerAccess(ctx, args.eventId);

    const members = await ctx.db
      .query("event_members")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const actorEmailByUserId = new Map(members.map((member) => [member.userId, member.email]));
    const actorLabel = (userId: string) => actorEmailByUserId.get(userId) ?? userId;

    const [agendaAudit, agentEvents, commsLog, notifications, apiTokens] = await Promise.all([
      ctx.db
        .query("agenda_items_audit")
        .withIndex("by_event_createdAt", (q) => q.eq("eventId", args.eventId))
        .order("desc")
        .take(PER_SOURCE_LIMIT),
      ctx.db
        .query("agent_run_events")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .order("desc")
        .take(PER_SOURCE_LIMIT),
      ctx.db
        .query("comms_log")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .order("desc")
        .take(PER_SOURCE_LIMIT),
      ctx.db
        .query("notifications")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .order("desc")
        .take(PER_SOURCE_LIMIT),
      ctx.db
        .query("api_tokens")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect(),
    ]);

    const apiTokenIds = new Set(apiTokens.map((token) => token._id));
    const apiTokenLabels = new Map(apiTokens.map((token) => [token._id, token.label]));
    const apiAudit = apiTokenIds.size
      ? (await ctx.db.query("api_audit_log").withIndex("by_createdAt").order("desc").take(500))
          .filter((entry) => apiTokenIds.has(entry.tokenId))
          .slice(0, PER_SOURCE_LIMIT)
      : [];

    const agendaOperationTitle: Record<string, string> = {
      create: "Agenda item created",
      update: "Agenda item updated",
      publish: "Agenda item published",
      delete: "Agenda item deleted",
    };

    const entries: ActivityEntry[] = [
      ...agendaAudit.map((row) => ({
        id: `agenda:${row._id}`,
        category: "agenda" as const,
        action: row.operation,
        title: agendaOperationTitle[row.operation] ?? `Agenda item ${row.operation}`,
        detail: typeof row.snapshot?.title === "string" ? row.snapshot.title : undefined,
        actorLabel: actorLabel(row.actorUserId),
        status: row.operation === "delete" ? ("warning" as const) : ("info" as const),
        createdAt: row.createdAt,
      })),
      ...agentEvents
        .filter((row) => row.type === "error" || row.type === "approval" || row.type === "proposal")
        .map((row) => ({
          id: `agent:${row._id}`,
          category: "agent" as const,
          action: row.type,
          title: row.type === "error" ? "Agent run error" : row.type === "approval" ? "Agent run approval" : "Agent proposal",
          detail: row.message,
          status: row.type === "error" ? ("error" as const) : ("info" as const),
          createdAt: row.createdAt,
        })),
      ...commsLog.map((row) => ({
        id: `comms:${row._id}`,
        category: "comms" as const,
        action: row.status,
        title: row.channel === "calendar_invite" ? "Calendar invite" : "Email",
        detail: `${row.subject} → ${row.toEmail}`,
        status: row.status === "failed" ? ("error" as const) : row.status === "sent" ? ("success" as const) : ("info" as const),
        createdAt: row.createdAt,
      })),
      ...notifications.map((row) => ({
        id: `notification:${row._id}`,
        category: "notification" as const,
        action: row.kind,
        title: row.title,
        detail: row.body,
        status: row.kind === "comms_delivery_failed" ? ("error" as const) : ("info" as const),
        createdAt: row.createdAt,
      })),
      ...apiAudit.map((row) => ({
        id: `api:${row._id}`,
        category: "api" as const,
        action: row.method,
        title: `${row.method} ${row.path}`,
        detail: `Token: ${apiTokenLabels.get(row.tokenId) ?? "Revoked token"} · Scope: ${row.scopeUsed}`,
        status: row.status < 300 ? ("success" as const) : row.status < 500 ? ("warning" as const) : ("error" as const),
        createdAt: row.createdAt,
      })),
    ];

    return entries.sort((a, b) => b.createdAt - a.createdAt).slice(0, FEED_LIMIT);
  },
});
