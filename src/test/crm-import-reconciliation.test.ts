import { describe, expect, it } from "vitest";
import type { UserIdentity } from "convex/server";
import { mergePreflight, mergeExactEmail, findActiveContactByEmail, resolveCanonicalContact } from "../../convex/crm";
import { upsertIdentityInternal } from "../../convex/crmSources";
import { handlerOf, makeFakeCtx, type Row } from "./helpers/fakeConvexCtx";

// #268 T006: CRM import sync must resolve to the canonical (post-merge) contact instead of
// resurrecting a tombstoned one, and must never crash on Convex's real `.unique()` throwing when
// an org's `by_org_email` index legitimately holds two rows (the merged tombstone and its target)
// with the same email.

const alice = { subject: "clerk|alice", email: "alice@acme.test", emailVerified: true, tokenIdentifier: "alice" } as unknown as UserIdentity;

function seed(overrides: Record<string, Row[]> = {}) {
  return {
    organizations: [{ _id: "org-a", name: "Acme Conf", createdByUserId: "clerk|alice" }],
    organizers: [{ _id: "organizer-a", organizationId: "org-a", userId: "clerk|alice", email: "alice@acme.test", role: "owner" }],
    events: [{ _id: "event-1", organizationId: "org-a", name: "Acme Spring", slug: "acme-spring", status: "published" }],
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
    crm_sources: [{ _id: "source-1", eventId: "event-1", provider: "notion", config: { emailField: "Email" }, credentialHint: "hint", credentialEnvelope: { version: 1, iv: "i", ciphertext: "c", tag: "t" }, status: "connected", updatedByUserId: "clerk|alice", createdAt: 1, updatedAt: 1 }],
    ...overrides,
  };
}

async function mergeSourceIntoTarget(ctx: unknown) {
  const { confirmationHash } = (await handlerOf(mergePreflight)(ctx as never, { organizationId: "org-a" as never, sourceContactId: "contact-1" as never, targetContactId: "contact-2" as never })) as { confirmationHash: string };
  return handlerOf(mergeExactEmail)(ctx as never, { organizationId: "org-a" as never, sourceContactId: "contact-1" as never, targetContactId: "contact-2" as never, confirmationHash });
}

describe("findActiveContactByEmail / resolveCanonicalContact", () => {
  it("resolves the active (non-tombstoned) contact when two rows share an email after a merge", async () => {
    const { ctx } = makeFakeCtx(alice, seed());
    await mergeSourceIntoTarget(ctx);
    const active = await findActiveContactByEmail(ctx as never, "org-a" as never, "dup@acme.test");
    expect(active?._id).toBe("contact-2");
  });

  it("walks a tombstone forward to its canonical contact", async () => {
    const { ctx } = makeFakeCtx(alice, seed());
    await mergeSourceIntoTarget(ctx);
    const tombstone = await (ctx as never as { db: { get: (id: string) => Promise<Row | null> } }).db.get("contact-1");
    const canonical = await resolveCanonicalContact(ctx as never, tombstone as never);
    expect(canonical._id).toBe("contact-2");
  });
});

describe("upsertIdentityInternal after a merge", () => {
  it("resolves an existing source-record mapping forward to the canonical contact instead of resurrecting the tombstone", async () => {
    const { ctx, tables } = makeFakeCtx(alice, seed({
      crm_source_records: [{ _id: "record-1", sourceId: "source-1", providerRecordId: "provider-rec-1", contactId: "contact-1", normalizedEmail: "dup@acme.test", createdAt: 1, updatedAt: 1 }],
    }));
    await mergeSourceIntoTarget(ctx); // merge already repoints crm_source_records eagerly...
    // ...but simulate a stale/out-of-band mapping still pointing at the tombstone, to prove the
    // defensive resolveCanonicalContact path in upsertIdentityInternal itself also holds.
    const record = tables.crm_source_records.find((r) => r._id === "record-1")!;
    record.contactId = "contact-1";

    const result = (await handlerOf(upsertIdentityInternal)(ctx, { sourceId: "source-1" as never, providerRecordId: "provider-rec-1", email: "dup@acme.test", firstName: "Fresh", lastName: "Import" })) as { created: boolean; updated: boolean };
    expect(result.created).toBe(false);
    expect(result.updated).toBe(true);

    const tombstone = tables.crm_contacts.find((c) => c._id === "contact-1")!;
    const canonical = tables.crm_contacts.find((c) => c._id === "contact-2")!;
    // The import landed on the canonical contact, not the tombstone.
    expect(canonical.firstName).toBe("Fresh");
    expect(tombstone.firstName).toBe("Old"); // untouched -- never resurrected
    expect(tombstone.mergedIntoContactId).toBe("contact-2");
  });

  it("a fresh import for the same email resolves to the canonical contact by email, not the tombstone", async () => {
    const { ctx, tables } = makeFakeCtx(alice, seed());
    await mergeSourceIntoTarget(ctx);

    const result = (await handlerOf(upsertIdentityInternal)(ctx, { sourceId: "source-1" as never, providerRecordId: "brand-new-provider-record", email: "dup@acme.test", firstName: "Fresh", lastName: "Import" })) as { created: boolean; updated: boolean };
    expect(result.created).toBe(false);
    expect(result.updated).toBe(true);

    const canonical = tables.crm_contacts.find((c) => c._id === "contact-2")!;
    const tombstone = tables.crm_contacts.find((c) => c._id === "contact-1")!;
    expect(canonical.firstName).toBe("Fresh");
    expect(tombstone.firstName).toBe("Old");

    const newRecord = tables.crm_source_records.find((r) => r.providerRecordId === "brand-new-provider-record")!;
    expect(newRecord.contactId).toBe("contact-2");
  });

  it("never overwrites CRM-owned stage or score during import, merged or not", async () => {
    const { ctx, tables } = makeFakeCtx(alice, seed());
    await mergeSourceIntoTarget(ctx);
    await handlerOf(upsertIdentityInternal)(ctx, { sourceId: "source-1" as never, providerRecordId: "provider-rec-2", email: "dup@acme.test", firstName: "Fresh", lastName: "Import" });
    const canonical = tables.crm_contacts.find((c) => c._id === "contact-2")!;
    expect(canonical.stage).toBe("confirmed");
    expect(canonical.score).toBe(40);
  });
});
