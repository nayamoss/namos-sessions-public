import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createRepository } from "@/data/transport";
import type { CrmContactId, EventId } from "@/data/types";

const eventId = "event-crm" as EventId;
const contactId = "contact-crm" as CrmContactId;

describe("event CRM contract", () => {
  it("keeps every browser operation event-scoped and behind explicit repository operations", async () => {
    const read = vi.fn().mockResolvedValue([]);
    const write = vi.fn().mockResolvedValue({ archived: 1 });
    const repo = createRepository({ read, write });

    await repo.crm.list({ eventId });
    await repo.crm.listSegments({ eventId });
    await repo.crm.save({ eventId, firstName: "Ada", lastName: "Lovelace", email: "ada@example.test", stage: "prospect", score: 0 });
    await repo.crm.saveSegment({ eventId, name: "Prospects", stage: "prospect" });
    await repo.crm.assignToEvent({ eventId, contactId });
    await repo.crm.unlinkFromEvent({ eventId, contactId });
    await repo.crm.archive({ eventId, contactIds: [contactId] });
    await repo.crm.bulkStage({ eventId, contactIds: [contactId], stage: "contacted" });
    await repo.crm.backfillEvent({ eventId });
    await repo.crm.listSources({ eventId });
    await repo.crm.connectSource({ eventId, provider: "airtable", token: "test-token", config: { airtableBaseId: "app123", airtableTableName: "Contacts", emailField: "Email", fullNameField: "Name" } });
    await repo.crm.syncSource({ eventId, provider: "airtable" });

    expect(read).toHaveBeenCalledWith("crm.list", { eventId });
    expect(read).toHaveBeenCalledWith("crm.segments.list", { eventId });
    expect(write).toHaveBeenCalledWith("crm.archive", { eventId, contactIds: [contactId] });
    expect(write).toHaveBeenCalledWith("crm.unlinkFromEvent", { eventId, contactId });
    expect(write).toHaveBeenCalledWith("crm.bulkStage", { eventId, contactIds: [contactId], stage: "contacted" });
    expect(read).toHaveBeenCalledWith("crm.sources.list", { eventId });
    expect(write).toHaveBeenCalledWith("crm.sources.sync", { eventId, provider: "airtable" });
  });

  it("uses a separate, encrypted source system and preserves CRM-owned workflow fields during import", () => {
    const schema = readFileSync("convex/schema.ts", "utf8");
    const source = readFileSync("convex/crmSourceActions.ts", "utf8");
    const data = readFileSync("convex/crmSources.ts", "utf8");
    const crons = readFileSync("convex/crons.ts", "utf8");
    expect(schema).toContain("crm_sources: defineTable");
    expect(schema).toContain("crm_source_records: defineTable");
    expect(source).toContain("encrypt(token, key())");
    expect(source).toContain("validMapping(args.config)");
    expect(source).toContain("syncAllDaily");
    expect(source).toContain("startOAuth");
    expect(source).toContain("finishOAuth");
    expect(source).toContain("crmSources.getOAuthPendingInternal");
    expect(source).toContain("crmSources.consumeOAuthPendingInternal");
    expect(crons).toContain("crm-source-sync");
    expect(data).toContain('withIndex("by_source_record"');
    // #268 T006: email lookup is delegated to the shared findActiveContactByEmail helper (which
    // still queries by_org_email, in convex/crm.ts) so a tombstoned contact's stored email can
    // never resolve as an import's match -- resurrecting a merged contact -- and so it can never
    // hit Convex's `.unique()` throwing when a merge leaves two same-email rows in one org.
    expect(data).toContain("findActiveContactByEmail(ctx, event.organizationId, email)");
    expect(data).toContain("resolveCanonicalContact(ctx, contact)");
    expect(data).not.toMatch(/stage:\s*args\.|score:\s*args\./);
    expect(schema).toContain("crm_oauth_states: defineTable");
    expect(schema).toContain("crm_oauth_pending: defineTable");
  });

  it("protects speaker history when unlinking an event membership", () => {
    const source = readFileSync("convex/crm.ts", "utf8");
    const start = source.indexOf("export const unlinkFromEvent");
    const unlink = source.slice(start, source.indexOf("export const listSegments", start));
    expect(unlink).toContain("assertEventOrganizerAccess(ctx, args.eventId)");
    expect(unlink).toContain("if (membership.speakerId)");
    expect(unlink).toContain("Archive it instead");
    expect(unlink).toContain("ctx.db.delete(membership._id)");
  });

  it("requires organizer access, enforces event membership, and keeps linking idempotent", () => {
    const source = readFileSync("convex/crm.ts", "utf8");
    const saveForEvent = source.slice(source.indexOf("export const saveForEvent"), source.indexOf("export const assignToEvent"));
    const backfill = source.slice(source.indexOf("export const backfillEvent"));

    expect(source).toContain("assertEventOrganizerAccess(ctx, args.eventId)");
    expect(saveForEvent).toContain('withIndex("by_event_contact"');
    expect(saveForEvent).toContain("if (!membership) await ctx.db.insert");
    expect(saveForEvent).toContain("A contact with this email already exists in this organization.");
    expect(saveForEvent).toContain("crm_stage_history");
    expect(backfill).toContain('withIndex("by_event_contact"');
    expect(backfill).toContain("if (!membership)");
  });

  it("archives rather than deleting records and scopes bulk changes to event memberships", () => {
    const source = readFileSync("convex/crm.ts", "utf8");
    const archive = source.slice(source.indexOf("export const archiveForEvent"), source.indexOf("export const bulkStageForEvent"));
    const bulk = source.slice(source.indexOf("export const bulkStageForEvent"), source.indexOf("export const assignToEvent"));

    expect(archive).toContain('stage: "archived"');
    expect(archive).toContain('withIndex("by_event_contact"');
    expect(archive).not.toContain("ctx.db.delete");
    expect(bulk).toContain('withIndex("by_event_contact"');
    expect(bulk).toContain("crm_stage_history");
  });

  it("only permits reviewed exact-email merges and preserves a source audit snapshot", () => {
    const schema = readFileSync("convex/schema.ts", "utf8");
    const source = readFileSync("convex/crm.ts", "utf8");
    const preflight = source.slice(source.indexOf("export const mergePreflight"), source.indexOf("export const mergeExactEmail"));
    const merge = source.slice(source.indexOf("export const mergeExactEmail"), source.indexOf("export const listForEvent"));

    expect(schema).toContain("crm_contact_merges: defineTable");
    expect(schema).toContain("mergedIntoContactId");
    expect(preflight).toContain("assertOrganizerOf(ctx, args.organizationId)");
    expect(preflight).toContain("Only contacts with the exact same email address can be merged.");
    expect(merge).toContain('withIndex("by_contact"');
    expect(merge).toContain("sourceSnapshot");
    expect(merge).toContain("mergedIntoContactId: target._id");
  });
});
