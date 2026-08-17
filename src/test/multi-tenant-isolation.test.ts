import { describe, expect, it } from "vitest";
import type { UserIdentity } from "convex/server";
import type { MutationCtx } from "../../convex/_generated/server";
import { list, listMine, listForPortal, listForApi } from "../../convex/events";
import { assertEventAccess, isOrganizerOf, organizationIdsForUser } from "../../convex/functions";

// The tenant boundary. Before organizations existed, a single global `organizers` table acted
// as a deployment-wide ACL: the first account to finish onboarding implicitly owned every
// event in the database, and any valid API key read every event. These cover the properties
// that stop that from being true.

type Row = Record<string, unknown> & { _id: string };

// Two organizations, each with its own owner and its own event. Nobody has an event_members
// row, so organization membership is the only thing under test.
function fakeCtx(identity?: UserIdentity, overrides: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {
    organizations: [
      { _id: "org-a", name: "Acme Conf", createdByUserId: "clerk|alice" },
      { _id: "org-b", name: "Beta Summit", createdByUserId: "clerk|bob" },
    ],
    organizers: [
      { _id: "organizer-a", organizationId: "org-a", userId: "clerk|alice", email: "alice@acme.test", role: "owner" },
      { _id: "organizer-b", organizationId: "org-b", userId: "clerk|bob", email: "bob@beta.test", role: "owner" },
    ],
    events: [
      { _id: "event-a", organizationId: "org-a", name: "Acme 2026", slug: "acme-2026", status: "published" },
      { _id: "event-b", organizationId: "org-b", name: "Beta 2026", slug: "beta-2026", status: "published" },
    ],
    event_members: [],
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
        const result = { collect: async () => matching(), unique: async () => matching()[0] ?? null };
        return { withIndex: (_index: string, apply?: (query: typeof builder) => typeof builder) => { apply?.(builder); return result; }, ...result };
      },
    },
  };
  return ctx as unknown as MutationCtx;
}

const alice = { subject: "clerk|alice", email: "alice@acme.test", emailVerified: true, tokenIdentifier: "alice" } as unknown as UserIdentity;
const bob = { subject: "clerk|bob", email: "bob@beta.test", emailVerified: true, tokenIdentifier: "bob" } as unknown as UserIdentity;
const stranger = { subject: "clerk|stranger", email: "stranger@nowhere.test", emailVerified: true, tokenIdentifier: "stranger" } as unknown as UserIdentity;

type Handler<Args> = (ctx: MutationCtx, args: Args) => Promise<unknown>;
const handlerOf = <Args,>(fn: unknown) => (fn as { _handler: Handler<Args> })._handler;

describe("organization boundary", () => {
  it("scopes an organizer to their own organization", async () => {
    const ctx = fakeCtx(alice);
    expect(await isOrganizerOf(ctx, alice, "org-a" as never)).toBe(true);
    expect(await isOrganizerOf(ctx, alice, "org-b" as never)).toBe(false);
  });

  it("denies access when an organizationId cannot be resolved, rather than falling back to global access", async () => {
    // An event that predates the backfill migration. Fail closed: reachable by nobody.
    const ctx = fakeCtx(alice, {
      events: [{ _id: "event-legacy", name: "Unmigrated", slug: "legacy", status: "published" }],
    });
    await expect(assertEventAccess(ctx, "event-legacy" as never)).rejects.toThrow("Forbidden");
    expect(await isOrganizerOf(ctx, alice, undefined)).toBe(false);
  });

  it("lets an owner reach their own event and refuses another organization's event", async () => {
    const ctx = fakeCtx(alice);
    await expect(assertEventAccess(ctx, "event-a" as never)).resolves.toBeDefined();
    await expect(assertEventAccess(ctx, "event-b" as never)).rejects.toThrow("Forbidden");
  });

  it("returns only the caller's own organization's events from events.list", async () => {
    const events = (await handlerOf(list)(fakeCtx(alice), {})) as Array<{ _id: string }>;
    expect(events.map((event) => event._id)).toEqual(["event-a"]);
  });

  it("returns only the caller's own events from events.listMine", async () => {
    const events = (await handlerOf(listMine)(fakeCtx(bob), {})) as Array<{ _id: string }>;
    expect(events.map((event) => event._id)).toEqual(["event-b"]);
  });

  it("does not leak published events to a signed-in stranger through the portal", async () => {
    const events = (await handlerOf(listForPortal)(fakeCtx(stranger), {})) as Array<{ _id: string }>;
    expect(events).toEqual([]);
    expect(await organizationIdsForUser(fakeCtx(stranger), stranger)).toEqual([]);
  });

  it("refuses events.list entirely for someone who organizes nothing", async () => {
    await expect(handlerOf(list)(fakeCtx(stranger), {})).rejects.toThrow("Forbidden");
  });

  it("scopes an API key to its own event instead of the whole database", async () => {
    const ctx = fakeCtx();
    const events = (await handlerOf<{ eventId: string }>(listForApi)(ctx, { eventId: "event-a" })) as Array<{ _id: string }>;
    expect(events.map((event) => event._id)).toEqual(["event-a"]);
  });

  it("still admits an explicit event_members guest without granting them the organization", async () => {
    const ctx = fakeCtx(stranger, {
      event_members: [
        { _id: "member-1", eventId: "event-a", userId: "clerk|stranger", email: "stranger@nowhere.test", role: "reviewer" },
      ],
    });
    await expect(assertEventAccess(ctx, "event-a" as never)).resolves.toBeDefined();
    await expect(assertEventAccess(ctx, "event-b" as never)).rejects.toThrow("Forbidden");
    expect(await organizationIdsForUser(ctx, stranger)).toEqual([]);
  });
});
