import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "convex/publicEmbeds.ts"), "utf8");

describe("saved public embed security contract", () => {
  it("authorizes every organizer operation with the event-scoped server gate", () => {
    for (const operation of ["list", "getAdmin", "duplicate", "remove"]) {
      const start = source.indexOf(`export const ${operation}`);
      expect(start, `${operation} export`).toBeGreaterThan(-1);
      const body = source.slice(start, source.indexOf("export const", start + 20));
      expect(body, `${operation} authorization`).toContain("assertEventOrganizerAccess");
    }
    expect(source.slice(source.indexOf("async function validateWrite"), source.indexOf("async function project"))).toContain("assertEventOrganizerAccess");
    for (const operation of ["preview", "save"]) {
      const start = source.indexOf(`export const ${operation}`);
      const body = source.slice(start, source.indexOf("export const", start + 20));
      expect(body, `${operation} validation gate`).toContain("validateWrite");
    }
  });

  it("keeps projection code typed, opaque, published-only, and allowlisted", () => {
    expect(source).not.toMatch(/\bany\b/);
    expect(source).not.toContain("slice(-8)");
    expect(source).toContain('item.isPublished');
    expect(source).toContain('submission.status === "accepted"');
    expect(source).toContain('event.status !== "published"');
    expect(source).toContain('key: `session-${index}`');
    expect(source).toContain('key: `speaker-${index}`');
    expect(source).toContain('key: `track-${index}`');
  });

  it("applies selected tracks to sessions and their visible speakers", () => {
    expect(source).toContain("selectedTrackIds.has(item.trackId)");
    expect(source).toContain("sourceSessions.some((session) => session.speakerIds.includes(speaker._id))");
  });

  it("exposes showcase metadata only for enabled embeds on a published event", () => {
    const start = source.indexOf("export const listShowcase");
    const body = source.slice(start, source.indexOf("export const get", start + 20));
    expect(body).toContain('event.status !== "published"');
    expect(body).toContain("candidate.enabled");
    expect(body).toContain("candidate.name === sample.name");
    expect(body).not.toContain("publicFeedProjection");
  });
});
