import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export type AgendaAuditOperation = "create" | "update" | "publish" | "delete";

export async function recordAgendaItemAudit(
  ctx: MutationCtx,
  args: {
    item: Doc<"agenda_items">;
    operation: AgendaAuditOperation;
    actorUserId: string;
    source: string;
  },
) {
  const createdAt = Date.now();
  const auditId = await ctx.db.insert("agenda_items_audit", {
    eventId: args.item.eventId,
    agendaItemId: args.item._id,
    operation: args.operation,
    actorUserId: args.actorUserId,
    source: args.source,
    snapshot: args.item,
    createdAt,
  });

  if (args.operation === "delete") {
    console.info("agenda_item_deleted", JSON.stringify({
      auditId,
      agendaItemId: args.item._id,
      eventId: args.item.eventId,
      actorUserId: args.actorUserId,
      source: args.source,
      createdAt,
    }));
  }

  return auditId;
}
