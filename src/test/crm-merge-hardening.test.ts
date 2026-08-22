import { describe, expect, it } from "vitest";
import type { UserIdentity } from "convex/server";
import { mergePreflight, mergeExactEmail, reverseMerge } from "../../convex/crm";
import { handlerOf, makeFakeCtx, type Row } from "./helpers/fakeConvexCtx";

// #268 T005: hardening the exact-email merge flow -- confirmation hash bound to the reviewed
// preview, transactional repoint, an audit row, idempotent merge/reversal, and a guarded reversal
// that refuses rather than guesses when references have moved since the merge.

const alice = { subject: "clerk|alice", email: "alice@acme.test", emailVerified: true, tokenIdentifier: "alice" } as unknown as UserIdentity;

function seed(overrides: Record<string, Row[]> = {}) {
  return {
    organizations: [{ _id: "org-a", name: "Acme Conf", createdByUserId: "clerk|alice" }],
    organizers: [{ _id: "organizer-a", organizationId: "org-a", userId: "clerk|alice", email: "alice@acme.test", role: "owner" }],
    events: [
      { _id: "event-1", organizationId: "org-a", name: "Acme Spring", slug: "acme-spring", status: "published" },
      { _id: "event-2", organizationId: "org-a", name: "Acme Fall", slug: "acme-fall", status: "published" },
    ],
    event_members: [],
    crm_contacts: [
      { _id: "contact-1", organizationId: "org-a", email: "dup@acme.test", firstName: "Old", lastName: "Name", stage: "invited", score: 10, createdAt: 1, updatedAt: 1 },
      { _id: "contact-2", organizationId: "org-a", email: "dup@acme.test", firstName: "New", lastName: "Name", stage: "confirmed", score: 40, createdAt: 2, updatedAt: 2 },
    ],
    crm_event_contacts: [],
    speakers: [],
    crm_source_records: [],
    crm_stage_history: [],
    crm_contact_merges: [],
    ...overrides,
  };
}

async function preflight(ctx: unknown) {
  return (await handlerOf(mergePreflight)(ctx as never, { organizationId: "org-a" as never, sourceContactId: "contact-1" as never, targetContactId: "contact-2" as never })) as { confirmationHash: string };
}

describe("mergeExactEmail confirmation hash", () => {
  it("accepts a merge confirmed with the hash from a fresh preflight", async () => {
    const { ctx, tables } = makeFakeCtx(alice, seed());
    const { confirmationHash } = await preflight(ctx);
    const result = (await handlerOf(mergeExactEmail)(ctx, { organizationId: "org-a" as never, sourceContactId: "contact-1" as never, targetContactId: "contact-2" as never, confirmationHash })) as { alreadyMerged: boolean };
    expect(result.alreadyMerged).toBe(false);
    expect(tables.crm_contacts.find((c) => c._id === "contact-1")?.mergedIntoContactId).toBe("contact-2");
    expect(tables.crm_contact_merges).toHaveLength(1);
  });

  it("refuses a merge confirmed with a stale hash from before references changed", async () => {
    const { ctx } = makeFakeCtx(alice, seed());
    const { confirmationHash } = await preflight(ctx);
    // Something changed after the preview was shown -- a new event membership landed.
    const tables2 = makeFakeCtx(alice, seed({
      crm_event_contacts: [{ _id: "ec-1", eventId: "event-1", contactId: "contact-1", createdAt: 5, updatedAt: 5 }],
    }));
    await expect(
      handlerOf(mergeExactEmail)(tables2.ctx, { organizationId: "org-a" as never, sourceContactId: "contact-1" as never, targetContactId: "contact-2" as never, confirmationHash }),
    ).rejects.toThrow("out of date");
  });

  it("refuses a fuzzy (non-exact-email) merge even with a valid-looking hash", async () => {
    const { ctx } = makeFakeCtx(alice, seed({
      crm_contacts: [
        { _id: "contact-1", organizationId: "org-a", email: "dup@acme.test", firstName: "Old", lastName: "Name", stage: "invited", score: 10, createdAt: 1, updatedAt: 1 },
        { _id: "contact-2", organizationId: "org-a", email: "different@acme.test", firstName: "New", lastName: "Name", stage: "confirmed", score: 40, createdAt: 2, updatedAt: 2 },
      ],
    }));
    await expect(
      handlerOf(mergeExactEmail)(ctx, { organizationId: "org-a" as never, sourceContactId: "contact-1" as never, targetContactId: "contact-2" as never, confirmationHash: "irrelevant" }),
    ).rejects.toThrow("exact same email");
  });
});

describe("merge idempotency", () => {
  it("retrying an already-applied merge is a no-op, not a double-merge", async () => {
    const { ctx, tables } = makeFakeCtx(alice, seed());
    const { confirmationHash } = await preflight(ctx);
    const first = (await handlerOf(mergeExactEmail)(ctx, { organizationId: "org-a" as never, sourceContactId: "contact-1" as never, targetContactId: "contact-2" as never, confirmationHash })) as { mergeId: string; alreadyMerged: boolean };
    const retry = (await handlerOf(mergeExactEmail)(ctx, { organizationId: "org-a" as never, sourceContactId: "contact-1" as never, targetContactId: "contact-2" as never, confirmationHash })) as { mergeId: string; alreadyMerged: boolean };
    expect(retry.alreadyMerged).toBe(true);
    expect(retry.mergeId).toBe(first.mergeId);
    expect(tables.crm_contact_merges).toHaveLength(1); // no second audit row
  });

  it("refuses to re-merge a source that was already merged into a different target", async () => {
    const { ctx } = makeFakeCtx(alice, seed({
      crm_contacts: [
        { _id: "contact-1", organizationId: "org-a", email: "dup@acme.test", firstName: "Old", lastName: "Name", stage: "invited", score: 10, mergedIntoContactId: "contact-3", createdAt: 1, updatedAt: 1 },
        { _id: "contact-2", organizationId: "org-a", email: "dup@acme.test", firstName: "New", lastName: "Name", stage: "confirmed", score: 40, createdAt: 2, updatedAt: 2 },
        { _id: "contact-3", organizationId: "org-a", email: "dup@acme.test", firstName: "Third", lastName: "Name", stage: "confirmed", score: 40, createdAt: 3, updatedAt: 3 },
      ],
    }));
    await expect(
      handlerOf(mergeExactEmail)(ctx, { organizationId: "org-a" as never, sourceContactId: "contact-1" as never, targetContactId: "contact-2" as never, confirmationHash: "irrelevant" }),
    ).rejects.toThrow("already been merged");
  });
});

describe("reverseMerge", () => {
  it("restores a simple merge (no dropped memberships) and is idempotent", async () => {
    const { ctx, tables } = makeFakeCtx(alice, seed({
      crm_event_contacts: [{ _id: "ec-1", eventId: "event-1", contactId: "contact-1", createdAt: 1, updatedAt: 1 }],
    }));
    const { confirmationHash } = await preflight(ctx);
    const merge = (await handlerOf(mergeExactEmail)(ctx, { organizationId: "org-a" as never, sourceContactId: "contact-1" as never, targetContactId: "contact-2" as never, confirmationHash })) as { mergeId: string };
    expect(tables.crm_event_contacts.find((r) => r._id === "ec-1")?.contactId).toBe("contact-2");

    const reversed = (await handlerOf(reverseMerge)(ctx, { organizationId: "org-a" as never, mergeId: merge.mergeId as never })) as { reversed: boolean; alreadyReversed: boolean };
    expect(reversed.reversed).toBe(true);
    expect(tables.crm_contacts.find((c) => c._id === "contact-1")?.mergedIntoContactId).toBeUndefined();
    expect(tables.crm_event_contacts.find((r) => r._id === "ec-1")?.contactId).toBe("contact-1");

    const retry = (await handlerOf(reverseMerge)(ctx, { organizationId: "org-a" as never, mergeId: merge.mergeId as never })) as { reversed: boolean; alreadyReversed: boolean };
    expect(retry.alreadyReversed).toBe(true);
    expect(retry.reversed).toBe(false);
  });

  it("recreates a dropped membership and restores a transferred speaker link on reversal", async () => {
    const { ctx, tables } = makeFakeCtx(alice, seed({
      crm_event_contacts: [
        { _id: "ec-source", eventId: "event-1", contactId: "contact-1", speakerId: "speaker-1", createdAt: 1, updatedAt: 1 },
        { _id: "ec-target", eventId: "event-1", contactId: "contact-2", createdAt: 1, updatedAt: 1 }, // target already has this event, no speaker
      ],
      speakers: [{ _id: "speaker-1", eventId: "event-1", contactId: "contact-1", email: "dup@acme.test", firstName: "Old", lastName: "Name", status: "active", createdAt: 1, updatedAt: 1 }],
    }));
    const { confirmationHash } = await preflight(ctx);
    const merge = (await handlerOf(mergeExactEmail)(ctx, { organizationId: "org-a" as never, sourceContactId: "contact-1" as never, targetContactId: "contact-2" as never, confirmationHash })) as { mergeId: string };

    // ec-source was deleted; its speaker was transferred onto ec-target.
    expect(tables.crm_event_contacts.find((r) => r._id === "ec-source")).toBeUndefined();
    expect(tables.crm_event_contacts.find((r) => r._id === "ec-target")?.speakerId).toBe("speaker-1");

    const reversed = (await handlerOf(reverseMerge)(ctx, { organizationId: "org-a" as never, mergeId: merge.mergeId as never })) as { reversed: boolean };
    expect(reversed.reversed).toBe(true);
    expect(tables.crm_event_contacts.find((r) => r._id === "ec-target")?.speakerId).toBeUndefined();
    const recreated = tables.crm_event_contacts.find((r) => r.eventId === "event-1" && r.contactId === "contact-1");
    expect(recreated?.speakerId).toBe("speaker-1");
  });

  it("refuses to reverse when a reference has changed since the merge", async () => {
    const { ctx, tables } = makeFakeCtx(alice, seed({
      crm_event_contacts: [{ _id: "ec-1", eventId: "event-1", contactId: "contact-1", createdAt: 1, updatedAt: 1 }],
    }));
    const { confirmationHash } = await preflight(ctx);
    const merge = (await handlerOf(mergeExactEmail)(ctx, { organizationId: "org-a" as never, sourceContactId: "contact-1" as never, targetContactId: "contact-2" as never, confirmationHash })) as { mergeId: string };

    // Something independently repoints ec-1 away from the target after the merge.
    const row = tables.crm_event_contacts.find((r) => r._id === "ec-1")!;
    row.contactId = "contact-3";

    await expect(handlerOf(reverseMerge)(ctx, { organizationId: "org-a" as never, mergeId: merge.mergeId as never })).rejects.toThrow("changed since this merge");
  });
});
