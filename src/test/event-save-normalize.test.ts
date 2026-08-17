import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeInput } from "../data/convex";

// Every caller of events.save on an existing event passes a whole previously-read event row,
// so the row carries server-managed columns the mutation sets itself. Publishing broke in
// production once already because `billingOwnerUserId` was added to the events table and
// reached the mutation, whose arg validator rejects any extra field.
describe("events.save input normalization", () => {
  const row = {
    id: "jx7ed9c88tzetsytep8wng5tb58cnsrm",
    name: "Namos Sessions Neutral QA",
    slug: "namos-sessions-neutral-qa",
    timezone: "America/New_York",
    startDate: 1788181200000,
    endDate: 1788267600000,
    exhibitorsEnabled: false,
    sponsorsEnabled: false,
    status: "published",
    type: "Conference",
    createdAt: 1788000000000,
    updatedAt: 1788000000000,
    organizationId: "org_123",
    billingOwnerUserId: "user_3I3Wqbheni4eJAbPi2i0XEMD5cF",
  };

  it("sends only the fields the mutation validator accepts", () => {
    const args = normalizeInput("events.save", row) as Record<string, unknown>;
    expect(args.eventId).toBe(row.id);
    expect(args.status).toBe("published");
    expect(args.name).toBe(row.name);
    for (const managed of ["id", "createdAt", "updatedAt", "organizationId", "billingOwnerUserId"])
      expect(args).not.toHaveProperty(managed);
  });

  it("drops any field the events table gains that the validator does not accept", () => {
    const args = normalizeInput("events.save", { ...row, someFutureColumn: "x" }) as Record<string, unknown>;
    expect(args).not.toHaveProperty("someFutureColumn");
  });

  // The allowlist is a hand-kept copy of the mutation's args; if the two drift, saves start
  // silently dropping fields the user just edited.
  it("matches the argument list of the events:save mutation", () => {
    const source = readFileSync(join(process.cwd(), "convex/events.ts"), "utf8");
    const start = source.indexOf("const eventFields = {");
    const fields = source.slice(start, source.indexOf("\n};", start)).matchAll(/^ {2}(\w+): v\./gm);
    const accepted = new Set([...fields].map((match) => match[1]));
    accepted.add("pullTeamFromEventId");
    const normalized = normalizeInput(
      "events.save",
      { id: row.id, ...Object.fromEntries([...accepted].map((field) => [field, "value"])) },
    ) as Record<string, unknown>;
    expect(new Set(Object.keys(normalized))).toEqual(new Set([...accepted, "eventId"]));
  });
});
