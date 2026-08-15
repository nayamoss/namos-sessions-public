import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { Doc } from "../../convex/_generated/dataModel";
import type { MutationCtx } from "../../convex/_generated/server";
import { recordAgendaItemAudit } from "../../convex/agendaAudit";

const item = {
  _id: "agenda_1",
  _creationTime: 1,
  eventId: "event_1",
  title: "Opening keynote",
  roomId: "room_1",
  speakerIds: [],
  startTime: 10,
  endTime: 20,
  isPublished: false,
  createdAt: 1,
  updatedAt: 1,
} as unknown as Doc<"agenda_items">;

describe("agenda item audit trail", () => {
  it("stores actor, source, operation, and a complete pre-delete snapshot", async () => {
    const insert = vi.fn().mockResolvedValue("audit_1");
    const ctx = { db: { insert } } as unknown as MutationCtx;
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await recordAgendaItemAudit(ctx, {
      item,
      operation: "delete",
      actorUserId: "user_1",
      source: "agenda:remove",
    });

    expect(insert).toHaveBeenCalledWith("agenda_items_audit", expect.objectContaining({
      eventId: item.eventId,
      agendaItemId: item._id,
      operation: "delete",
      actorUserId: "user_1",
      source: "agenda:remove",
      snapshot: item,
    }));
    expect(log).toHaveBeenCalledWith("agenda_item_deleted", expect.stringContaining(String(item._id)));
    log.mockRestore();
  });

  it("cannot delete through agenda:remove without first recording the audit row", () => {
    const source = readFileSync(join(process.cwd(), "convex/agenda.ts"), "utf8");
    const remove = source.slice(source.indexOf("export const remove"), source.indexOf("export const publishSchedule"));

    expect(remove.indexOf('operation: "delete"')).toBeGreaterThan(-1);
    expect(remove.indexOf('operation: "delete"')).toBeLessThan(remove.indexOf("ctx.db.delete(args.id)"));
  });

  it("keeps the append-only audit table and every application agenda operation wired", () => {
    const schema = readFileSync(join(process.cwd(), "convex/schema.ts"), "utf8");
    const agenda = readFileSync(join(process.cwd(), "convex/agenda.ts"), "utf8");
    const seed = readFileSync(join(process.cwd(), "convex/seed.ts"), "utf8");

    expect(schema).toContain("agenda_items_audit: defineTable");
    for (const operation of ["create", "update", "publish", "delete"]) {
      expect(agenda).toContain(`operation: "${operation}"`);
    }
    expect(seed).toContain('source: "seed:demo"');
  });
});
