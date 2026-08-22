import { describe, expect, it } from "vitest";
import type { UserIdentity } from "convex/server";
import { assignOrganizationContactToEvent, unlinkOrganizationContactFromEvent } from "../../convex/crm";
import { handlerOf, makeFakeCtx, type Row } from "./helpers/fakeConvexCtx";

// #268 T004: assigning/unlinking an organization contact's event membership must never delete
// the underlying organization contact or its speaker history -- only the join row.

const alice = { subject: "clerk|alice", email: "alice@acme.test", emailVerified: true, tokenIdentifier: "alice" } as unknown as UserIdentity;
const eventAdmin = { subject: "clerk|dana", email: "dana@events.test", emailVerified: true, tokenIdentifier: "dana" } as unknown as UserIdentity;

function seed(overrides: Record<string, Row[]> = {}) {
  return {
    organizations: [{ _id: "org-a", name: "Acme Conf", createdByUserId: "clerk|alice" }],
    organizers: [{ _id: "organizer-a", organizationId: "org-a", userId: "clerk|alice", email: "alice@acme.test", role: "owner" }],
    events: [
      { _id: "event-1", organizationId: "org-a", name: "Acme Spring", slug: "acme-spring", status: "published" },
      { _id: "event-2", organizationId: "org-a", name: "Acme Fall", slug: "acme-fall", status: "published" },
    ],
    event_members: [],
    crm_contacts: [{ _id: "contact-1", organizationId: "org-a", email: "one@acme.test", firstName: "One", lastName: "Speaker", stage: "invited", score: 10, createdAt: 1, updatedAt: 1 }],
    crm_event_contacts: [],
    speakers: [],
    ...overrides,
  };
}

describe("assignOrganizationContactToEvent / unlinkOrganizationContactFromEvent", () => {
  it("creates a membership row without touching the contact, and is idempotent on retry", async () => {
    const { ctx, tables } = makeFakeCtx(alice, seed());
    const first = (await handlerOf(assignOrganizationContactToEvent)(ctx, { organizationId: "org-a" as never, contactId: "contact-1" as never, eventId: "event-1" as never })) as { membershipId: string; created: boolean };
    expect(first.created).toBe(true);
    expect(tables.crm_event_contacts).toHaveLength(1);
    expect(tables.crm_contacts).toHaveLength(1); // the contact itself is untouched

    const second = (await handlerOf(assignOrganizationContactToEvent)(ctx, { organizationId: "org-a" as never, contactId: "contact-1" as never, eventId: "event-1" as never })) as { membershipId: string; created: boolean };
    expect(second.created).toBe(false);
    expect(second.membershipId).toBe(first.membershipId);
    expect(tables.crm_event_contacts).toHaveLength(1);
  });

  it("refuses to assign a tombstoned (merged) contact", async () => {
    const { ctx } = makeFakeCtx(alice, seed({
      crm_contacts: [{ _id: "contact-1", organizationId: "org-a", email: "one@acme.test", firstName: "One", lastName: "Speaker", stage: "invited", score: 10, mergedIntoContactId: "contact-2", createdAt: 1, updatedAt: 1 }],
    }));
    await expect(handlerOf(assignOrganizationContactToEvent)(ctx, { organizationId: "org-a" as never, contactId: "contact-1" as never, eventId: "event-1" as never })).rejects.toThrow("merged");
  });

  it("scopes an event-only organizer to only their authorized events", async () => {
    const { ctx } = makeFakeCtx(eventAdmin, seed({
      event_members: [{ _id: "member-1", eventId: "event-1", userId: "clerk|dana", email: "dana@events.test", role: "organizer" }],
    }));
    await expect(handlerOf(assignOrganizationContactToEvent)(ctx, { organizationId: "org-a" as never, contactId: "contact-1" as never, eventId: "event-2" as never })).rejects.toThrow("Forbidden");
    await expect(handlerOf(assignOrganizationContactToEvent)(ctx, { organizationId: "org-a" as never, contactId: "contact-1" as never, eventId: "event-1" as never })).resolves.toMatchObject({ created: true });
  });

  it("unlink deletes only the membership row, leaving the contact and speaker intact", async () => {
    const { ctx, tables } = makeFakeCtx(alice, seed({
      crm_event_contacts: [{ _id: "ec-1", eventId: "event-1", contactId: "contact-1", createdAt: 1, updatedAt: 1 }],
    }));
    const result = (await handlerOf(unlinkOrganizationContactFromEvent)(ctx, { organizationId: "org-a" as never, contactId: "contact-1" as never, eventId: "event-1" as never })) as { unlinked: boolean };
    expect(result.unlinked).toBe(true);
    expect(tables.crm_event_contacts).toHaveLength(0);
    expect(tables.crm_contacts).toHaveLength(1);
  });

  it("blocks unlink when a speaker is still attached, to preserve speaker/portal history", async () => {
    const { ctx, tables } = makeFakeCtx(alice, seed({
      crm_event_contacts: [{ _id: "ec-1", eventId: "event-1", contactId: "contact-1", speakerId: "speaker-1", createdAt: 1, updatedAt: 1 }],
      speakers: [{ _id: "speaker-1", eventId: "event-1", contactId: "contact-1", email: "one@acme.test", firstName: "One", lastName: "Speaker", status: "active", createdAt: 1, updatedAt: 1 }],
    }));
    await expect(handlerOf(unlinkOrganizationContactFromEvent)(ctx, { organizationId: "org-a" as never, contactId: "contact-1" as never, eventId: "event-1" as never })).rejects.toThrow("Archive it instead");
    expect(tables.crm_event_contacts).toHaveLength(1);
    expect(tables.speakers).toHaveLength(1);
  });

  it("unlink is a safe no-op when no membership exists", async () => {
    const { ctx } = makeFakeCtx(alice, seed());
    const result = (await handlerOf(unlinkOrganizationContactFromEvent)(ctx, { organizationId: "org-a" as never, contactId: "contact-1" as never, eventId: "event-1" as never })) as { unlinked: boolean };
    expect(result.unlinked).toBe(false);
  });
});
