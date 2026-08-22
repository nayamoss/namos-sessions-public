import { describe, expect, it } from "vitest";
import type { UserIdentity } from "convex/server";
import type { MutationCtx } from "../../convex/_generated/server";
import { assertOrganizationCrmAccess } from "../../convex/functions";
import { listOrganizationDirectory, getOrganizationContact } from "../../convex/crm";

// Adversarial coverage for the organization-wide CRM directory/detail projections (#268 T001).
// An event-only admin (an event_members "organizer" row but no organizers row of their own)
// must never see contacts outside the events they were explicitly given, even though the
// directory/detail queries take only an organizationId.

type Row = Record<string, unknown> & { _id: string };

function fakeCtx(identity?: UserIdentity, overrides: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {
    organizations: [{ _id: "org-a", name: "Acme Conf", createdByUserId: "clerk|alice" }],
    organizers: [
      { _id: "organizer-a", organizationId: "org-a", userId: "clerk|alice", email: "alice@acme.test", role: "owner" },
    ],
    events: [
      { _id: "event-1", organizationId: "org-a", name: "Acme Spring", slug: "acme-spring", status: "published" },
      { _id: "event-2", organizationId: "org-a", name: "Acme Fall", slug: "acme-fall", status: "published" },
    ],
    event_members: [],
    crm_contacts: [],
    crm_event_contacts: [],
    speakers: [],
    crm_source_records: [],
    crm_stage_history: [],
    ...overrides,
  };
  const byId = new Map<string, Row>(Object.values(tables).flat().map((row) => [row._id, row]));
  const ctx = {
    auth: { getUserIdentity: async () => identity ?? null },
    db: {
      get: async (id: string) => byId.get(id) ?? null,
      query: (table: string) => {
        const rows = tables[table] ?? [];
        const conditions: Array<[string, unknown]> = [];
        const matching = () => rows.filter((row) => conditions.every(([field, value]) => row[field] === value));
        const builder = { eq: (field: string, value: unknown) => { conditions.push([field, value]); return builder; } };
        const result = {
          collect: async () => matching(),
          unique: async () => matching()[0] ?? null,
          order: () => result,
          paginate: async (paginationOpts: { numItems: number; cursor: string | null }) => {
            const all = matching();
            const start = paginationOpts.cursor ? all.findIndex((r) => r._id === paginationOpts.cursor) + 1 : 0;
            const page = all.slice(start, start + paginationOpts.numItems);
            const isDone = start + page.length >= all.length;
            return { page, isDone, continueCursor: isDone ? "" : page[page.length - 1]?._id ?? "" };
          },
        };
        return { withIndex: (_index: string, apply?: (query: typeof builder) => typeof builder) => { apply?.(builder); return result; }, ...result };
      },
    },
  };
  return ctx as unknown as MutationCtx;
}

const alice = { subject: "clerk|alice", email: "alice@acme.test", emailVerified: true, tokenIdentifier: "alice" } as unknown as UserIdentity;
const eventAdmin = { subject: "clerk|dana", email: "dana@events.test", emailVerified: true, tokenIdentifier: "dana" } as unknown as UserIdentity;
const stranger = { subject: "clerk|mallory", email: "mallory@nowhere.test", emailVerified: true, tokenIdentifier: "mallory" } as unknown as UserIdentity;

type Handler<Args> = (ctx: MutationCtx, args: Args) => Promise<unknown>;
const handlerOf = <Args,>(fn: unknown) => (fn as { _handler: Handler<Args> })._handler;

describe("organization CRM access", () => {
  it("grants full-organization scope to an owner/admin", async () => {
    const ctx = fakeCtx(alice);
    const access = await assertOrganizationCrmAccess(ctx, "org-a" as never);
    expect(access.scope).toBe("organization");
  });

  it("scopes an event-only organizer to only the events they were explicitly given", async () => {
    const ctx = fakeCtx(eventAdmin, {
      event_members: [
        { _id: "member-1", eventId: "event-1", userId: "clerk|dana", email: "dana@events.test", role: "organizer" },
      ],
    });
    const access = await assertOrganizationCrmAccess(ctx, "org-a" as never);
    expect(access).toMatchObject({ scope: "events", eventIds: ["event-1"] });
  });

  it("never elevates a reviewer-role event_members row to organizer access", async () => {
    const ctx = fakeCtx(eventAdmin, {
      event_members: [
        { _id: "member-1", eventId: "event-1", userId: "clerk|dana", email: "dana@events.test", role: "reviewer" },
      ],
    });
    await expect(assertOrganizationCrmAccess(ctx, "org-a" as never)).rejects.toThrow("Forbidden");
  });

  it("refuses a stranger with no organizers row and no event_members row anywhere in the org", async () => {
    const ctx = fakeCtx(stranger);
    await expect(assertOrganizationCrmAccess(ctx, "org-a" as never)).rejects.toThrow("Forbidden");
  });

  it("does not leak an event_members row from a different organization's event", async () => {
    const ctx = fakeCtx(eventAdmin, {
      organizations: [{ _id: "org-a", name: "Acme Conf", createdByUserId: "clerk|alice" }, { _id: "org-b", name: "Beta Summit", createdByUserId: "clerk|bob" }],
      events: [
        { _id: "event-1", organizationId: "org-a", name: "Acme Spring", slug: "acme-spring", status: "published" },
        { _id: "event-9", organizationId: "org-b", name: "Beta Only", slug: "beta-only", status: "published" },
      ],
      event_members: [
        { _id: "member-9", eventId: "event-9", userId: "clerk|dana", email: "dana@events.test", role: "organizer" },
      ],
    });
    await expect(assertOrganizationCrmAccess(ctx, "org-a" as never)).rejects.toThrow("Forbidden");
  });

  describe("listOrganizationDirectory", () => {
    const crm_contacts = [
      { _id: "contact-1", organizationId: "org-a", email: "one@acme.test", firstName: "One", lastName: "Speaker", stage: "invited", score: 10, createdAt: 1 },
      { _id: "contact-2", organizationId: "org-a", email: "two@acme.test", firstName: "Two", lastName: "Speaker", stage: "invited", score: 10, createdAt: 2 },
      { _id: "contact-3", organizationId: "org-a", email: "three@acme.test", firstName: "Three", lastName: "Speaker", stage: "invited", score: 10, createdAt: 3 },
    ];
    const crm_event_contacts = [
      { _id: "ec-1", eventId: "event-1", contactId: "contact-1", createdAt: 1, updatedAt: 1 },
      { _id: "ec-2", eventId: "event-2", contactId: "contact-2", createdAt: 1, updatedAt: 1 },
      { _id: "ec-3", eventId: "event-2", contactId: "contact-3", createdAt: 1, updatedAt: 1 },
    ];

    it("returns every organization contact for an owner/admin", async () => {
      const ctx = fakeCtx(alice, { crm_contacts, crm_event_contacts });
      const result = (await handlerOf(listOrganizationDirectory)(ctx, {
        organizationId: "org-a", paginationOpts: { numItems: 50, cursor: null },
      })) as { page: Array<{ _id: string }> };
      expect(result.page.map((c) => c._id).sort()).toEqual(["contact-1", "contact-2", "contact-3"]);
    });

    it("limits an event-only organizer to contacts linked to their authorized events only", async () => {
      const ctx = fakeCtx(eventAdmin, {
        crm_contacts,
        crm_event_contacts,
        event_members: [
          { _id: "member-1", eventId: "event-1", userId: "clerk|dana", email: "dana@events.test", role: "organizer" },
        ],
      });
      const result = (await handlerOf(listOrganizationDirectory)(ctx, {
        organizationId: "org-a", paginationOpts: { numItems: 50, cursor: null },
      })) as { page: Array<{ _id: string }> };
      expect(result.page.map((c) => c._id)).toEqual(["contact-1"]);
    });

    it("refuses an event-only organizer filtering to an event they were not given", async () => {
      const ctx = fakeCtx(eventAdmin, {
        crm_contacts,
        crm_event_contacts,
        event_members: [
          { _id: "member-1", eventId: "event-1", userId: "clerk|dana", email: "dana@events.test", role: "organizer" },
        ],
      });
      await expect(
        handlerOf(listOrganizationDirectory)(ctx, { organizationId: "org-a", eventId: "event-2", paginationOpts: { numItems: 50, cursor: null } }),
      ).rejects.toThrow("Forbidden");
    });

    it("refuses the whole directory to a stranger", async () => {
      const ctx = fakeCtx(stranger, { crm_contacts, crm_event_contacts });
      await expect(
        handlerOf(listOrganizationDirectory)(ctx, { organizationId: "org-a", paginationOpts: { numItems: 50, cursor: null } }),
      ).rejects.toThrow("Forbidden");
    });
  });

  describe("getOrganizationContact", () => {
    const crm_contacts = [
      { _id: "contact-1", organizationId: "org-a", email: "one@acme.test", firstName: "One", lastName: "Speaker", stage: "invited", score: 10, createdAt: 1, updatedAt: 1 },
    ];

    it("denies an event-only organizer detail access to a contact outside their authorized events", async () => {
      const ctx = fakeCtx(eventAdmin, {
        crm_contacts,
        crm_event_contacts: [{ _id: "ec-2", eventId: "event-2", contactId: "contact-1", createdAt: 1, updatedAt: 1 }],
        event_members: [
          { _id: "member-1", eventId: "event-1", userId: "clerk|dana", email: "dana@events.test", role: "organizer" },
        ],
      });
      await expect(handlerOf(getOrganizationContact)(ctx, { organizationId: "org-a", contactId: "contact-1" })).rejects.toThrow("Contact not found.");
    });

    it("allows an event-only organizer to see a contact linked to one of their authorized events", async () => {
      const ctx = fakeCtx(eventAdmin, {
        crm_contacts,
        crm_event_contacts: [{ _id: "ec-1", eventId: "event-1", contactId: "contact-1", createdAt: 1, updatedAt: 1 }],
        event_members: [
          { _id: "member-1", eventId: "event-1", userId: "clerk|dana", email: "dana@events.test", role: "organizer" },
        ],
      });
      const result = (await handlerOf(getOrganizationContact)(ctx, { organizationId: "org-a", contactId: "contact-1" })) as {
        contact: { _id: string }; events: unknown[]; history: unknown[]; sources: unknown[];
      };
      expect(result.contact._id).toBe("contact-1");
      expect(result.events).toHaveLength(1);
      // Conservative deny-by-default: organization-wide history/source provenance is withheld
      // from an event-limited caller even when they can see the contact's identity.
      expect(result.history).toEqual([]);
      expect(result.sources).toEqual([]);
    });

    it("refuses a stranger with no access to the organization at all", async () => {
      const ctx = fakeCtx(stranger, { crm_contacts });
      await expect(handlerOf(getOrganizationContact)(ctx, { organizationId: "org-a", contactId: "contact-1" })).rejects.toThrow("Forbidden");
    });
  });
});
