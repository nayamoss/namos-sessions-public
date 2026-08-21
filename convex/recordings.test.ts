import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { hostedSource } from "./recordings";

// convex-test loads every function module so it can route mutation/query calls; without this
// glob it only sees schema.ts and every api.* call 404s.
const modules = import.meta.glob("./**/*.ts");

const ORGANIZER = { subject: "user_organizer", email: "organizer@example.com" };
const OUTSIDER = { subject: "user_outsider", email: "outsider@example.com" };

async function seedEvent(t: ReturnType<typeof convexTest>, opts: { endTime: number }) {
  const organizerT = t.withIdentity(ORGANIZER);
  const { eventId, agendaItemId } = await t.run(async (ctx) => {
    const organizationId = await ctx.db.insert("organizations", { name: "Org", createdByUserId: ORGANIZER.subject, createdAt: Date.now() });
    await ctx.db.insert("organizers", { organizationId, userId: ORGANIZER.subject, email: ORGANIZER.email, role: "owner", createdAt: Date.now() });
    const eventId = await ctx.db.insert("events", {
      organizationId, name: "Test Conf", slug: "test-conf", timezone: "America/New_York",
      startDate: Date.now(), endDate: Date.now(), exhibitorsEnabled: false, sponsorsEnabled: false,
      status: "published", createdAt: Date.now(), updatedAt: Date.now(),
    });
    const roomId = await ctx.db.insert("rooms", { eventId, name: "Main Hall", sortOrder: 0 });
    const agendaItemId = await ctx.db.insert("agenda_items", {
      eventId, title: "Opening Keynote", roomId, startTime: Date.now() - 1000, endTime: opts.endTime,
      speakerIds: [], isPublished: true, createdAt: Date.now(), updatedAt: Date.now(),
    });
    return { eventId, agendaItemId };
  });
  return { organizerT, eventId, agendaItemId };
}

describe("hostedSource host classification", () => {
  it("classifies youtube.com watch URLs as embeddable youtube", () => {
    const result = hostedSource("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(result.provider).toBe("youtube");
    expect(result.embedUrl).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  it("classifies youtu.be short links as youtube", () => {
    const result = hostedSource("https://youtu.be/dQw4w9WgXcQ");
    expect(result.provider).toBe("youtube");
  });

  it("classifies vimeo.com links as embeddable vimeo", () => {
    const result = hostedSource("https://vimeo.com/76979871");
    expect(result.provider).toBe("vimeo");
    expect(result.embedUrl).toBe("https://player.vimeo.com/video/76979871");
  });

  it("classifies an S3 URL as an external link with no embed", () => {
    const result = hostedSource("https://my-bucket.s3.amazonaws.com/recordings/session.mp4");
    expect(result.provider).toBe("external");
    expect(result.embedUrl).toBeUndefined();
  });

  it("classifies an unrecognized HTTPS host as external", () => {
    const result = hostedSource("https://cdn.example.com/video.mp4");
    expect(result.provider).toBe("external");
  });

  it("rejects non-HTTPS URLs", () => {
    expect(() => hostedSource("http://example.com/video.mp4")).toThrow(/HTTPS/);
  });

  it("rejects URLs carrying embedded credentials", () => {
    expect(() => hostedSource("https://user:pass@example.com/video.mp4")).toThrow(/credential-free/);
  });

  it("rejects malformed URLs", () => {
    expect(() => hostedSource("not a url")).toThrow(/valid HTTPS/);
  });

  it("does not classify a spoofed host merely ending in youtube.com as youtube", () => {
    const result = hostedSource("https://evilyoutube.com/watch?v=dQw4w9WgXcQ");
    expect(result.provider).toBe("external");
    expect(result.embedUrl).toBeUndefined();
  });

  it("does not classify a spoofed host merely ending in vimeo.com as vimeo", () => {
    const result = hostedSource("https://attacker-vimeo.com/76979871");
    expect(result.provider).toBe("external");
    expect(result.embedUrl).toBeUndefined();
  });

  it("still classifies a real youtube.com subdomain as youtube", () => {
    const result = hostedSource("https://m.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(result.provider).toBe("youtube");
  });
});

describe("attachHosted", () => {
  it("rejects a non-HTTPS or credentialed URL at the mutation boundary", async () => {
    const t = convexTest(schema, modules);
    const { organizerT, eventId, agendaItemId } = await seedEvent(t, { endTime: Date.now() - 1000 });
    await expect(
      organizerT.mutation(api.recordings.attachHosted, { eventId, agendaItemId, hostedUrl: "ftp://example.com/video.mp4" }),
    ).rejects.toThrow();
  });

  it("rejects a caller who is not an organizer of the event", async () => {
    const t = convexTest(schema, modules);
    const { eventId, agendaItemId } = await seedEvent(t, { endTime: Date.now() - 1000 });
    const outsiderT = t.withIdentity(OUTSIDER);
    await expect(
      outsiderT.mutation(api.recordings.attachHosted, { eventId, agendaItemId, hostedUrl: "https://vimeo.com/76979871" }),
    ).rejects.toThrow(/Forbidden/);
  });
});

describe("publish gating", () => {
  it("blocks publishing before the session has ended without an override", async () => {
    const t = convexTest(schema, modules);
    const { organizerT, eventId, agendaItemId } = await seedEvent(t, { endTime: Date.now() + 60 * 60 * 1000 });
    const recordingId = await organizerT.mutation(api.recordings.attachHosted, { eventId, agendaItemId, hostedUrl: "https://vimeo.com/76979871" });
    await expect(
      organizerT.mutation(api.recordings.publish, { eventId, recordingId }),
    ).rejects.toThrow(/has not ended/);
  });

  it("allows publishing before session end when an override reason is given, and records it as published_early", async () => {
    const t = convexTest(schema, modules);
    const { organizerT, eventId, agendaItemId } = await seedEvent(t, { endTime: Date.now() + 60 * 60 * 1000 });
    const recordingId = await organizerT.mutation(api.recordings.attachHosted, { eventId, agendaItemId, hostedUrl: "https://vimeo.com/76979871" });
    await organizerT.mutation(api.recordings.publish, { eventId, recordingId, overrideReason: "Speaker pre-approved release" });

    const detail = await organizerT.query(api.recordings.get, { eventId, agendaItemId });
    expect(detail.recordings.find((r) => r._id === recordingId)?.publicationStatus).toBe("published");
    const entry = detail.history.find((h) => h.action === "published_early");
    expect(entry?.detail).toBe("Speaker pre-approved release");
  });

  it("publishes freely once the session has ended, no override required", async () => {
    const t = convexTest(schema, modules);
    const { organizerT, eventId, agendaItemId } = await seedEvent(t, { endTime: Date.now() - 1000 });
    const recordingId = await organizerT.mutation(api.recordings.attachHosted, { eventId, agendaItemId, hostedUrl: "https://vimeo.com/76979871" });
    await organizerT.mutation(api.recordings.publish, { eventId, recordingId });
    const detail = await organizerT.query(api.recordings.get, { eventId, agendaItemId });
    expect(detail.recordings.find((r) => r._id === recordingId)?.publicationStatus).toBe("published");
  });
});

describe("cross-event isolation", () => {
  it("refuses to attach a recording to a session that belongs to a different event", async () => {
    const t = convexTest(schema, modules);
    const { organizerT, agendaItemId } = await seedEvent(t, { endTime: Date.now() - 1000 });
    const { eventId: otherEventId } = await seedEvent(t, { endTime: Date.now() - 1000 });
    await expect(
      organizerT.mutation(api.recordings.attachHosted, { eventId: otherEventId, agendaItemId, hostedUrl: "https://vimeo.com/76979871" }),
    ).rejects.toThrow(/Session not found/);
  });

  it("refuses to reuse a video asset from another event", async () => {
    const t = convexTest(schema, modules);
    const { eventId: sourceEventId } = await seedEvent(t, { endTime: Date.now() - 1000 });
    const { organizerT, eventId, agendaItemId } = await seedEvent(t, { endTime: Date.now() - 1000 });
    const assetId = await t.run(async (ctx) => {
      const storageId = await ctx.storage.store(new Blob(["video"], { type: "video/mp4" }));
      return ctx.db.insert("event_assets", { eventId: sourceEventId, kind: "video", storageId, fileName: "private.mp4", mimeType: "video/mp4", sizeBytes: 5, createdByUserId: ORGANIZER.subject, createdAt: Date.now(), updatedAt: Date.now() });
    });
    await expect(
      organizerT.mutation(api.recordings.attachAsset, { eventId, agendaItemId, assetId }),
    ).rejects.toThrow(/not found for this event/);
  });
});

describe("manager scale and bulk outcomes", () => {
  it("returns up to 500 scheduled sessions for the operations manager", async () => {
    const t = convexTest(schema, modules);
    const { organizerT, eventId, agendaItemId } = await seedEvent(t, { endTime: Date.now() - 1000 });
    await t.run(async (ctx) => {
      const original = await ctx.db.get(agendaItemId);
      if (!original) throw new Error("Missing seeded session");
      for (let index = 0; index < 120; index += 1) {
        await ctx.db.insert("agenda_items", { eventId, title: `Session ${index}`, roomId: original.roomId, startTime: index, endTime: index + 1, speakerIds: [], isPublished: false, createdAt: index, updatedAt: index });
      }
    });
    const rows = await organizerT.query(api.recordings.list, { eventId });
    expect(rows).toHaveLength(121);
  });

  it("reports successful and failed sessions independently during bulk publish", async () => {
    const t = convexTest(schema, modules);
    const { organizerT, eventId, agendaItemId } = await seedEvent(t, { endTime: Date.now() - 1000 });
    const futureAgendaItemId = await t.run(async (ctx) => {
      const original = await ctx.db.get(agendaItemId);
      if (!original) throw new Error("Missing seeded session");
      return ctx.db.insert("agenda_items", { eventId, title: "Future session", roomId: original.roomId, startTime: Date.now(), endTime: Date.now() + 60_000, speakerIds: [], isPublished: true, createdAt: Date.now(), updatedAt: Date.now() });
    });
    const readyId = await organizerT.mutation(api.recordings.attachHosted, { eventId, agendaItemId, hostedUrl: "https://vimeo.com/76979871" });
    const futureId = await organizerT.mutation(api.recordings.attachHosted, { eventId, agendaItemId: futureAgendaItemId, hostedUrl: "https://vimeo.com/111222333" });
    const results = await organizerT.mutation(api.recordings.bulkPublish, { eventId, recordingIds: [readyId, futureId] });
    expect(results).toEqual([
      { recordingId: readyId, status: "published" },
      { recordingId: futureId, status: "failed", error: expect.stringMatching(/has not ended/) },
    ]);
  });

  it("does not publish failed processing rows", async () => {
    const t = convexTest(schema, modules);
    const { organizerT, eventId, agendaItemId } = await seedEvent(t, { endTime: Date.now() - 1000 });
    const recordingId = await organizerT.mutation(api.recordings.attachHosted, { eventId, agendaItemId, hostedUrl: "https://vimeo.com/76979871" });
    await t.run((ctx) => ctx.db.patch(recordingId, { availability: "failed", failureReason: "Preview generation failed." }));
    await expect(organizerT.mutation(api.recordings.publish, { eventId, recordingId })).rejects.toThrow(/Preview generation failed/);
  });
});

describe("staged replacement", () => {
  it("keeps the original active recording published until the replacement is itself published", async () => {
    const t = convexTest(schema, modules);
    const { organizerT, eventId, agendaItemId } = await seedEvent(t, { endTime: Date.now() - 1000 });
    const originalId = await organizerT.mutation(api.recordings.attachHosted, { eventId, agendaItemId, hostedUrl: "https://vimeo.com/76979871" });
    await organizerT.mutation(api.recordings.publish, { eventId, recordingId: originalId });

    const replacementId = await organizerT.mutation(api.recordings.attachHosted, { eventId, agendaItemId, hostedUrl: "https://vimeo.com/111222333" });
    const midway = await organizerT.query(api.recordings.get, { eventId, agendaItemId });
    expect(midway.recordings.find((r) => r._id === originalId)?.publicationStatus).toBe("published");
    expect(midway.recordings.find((r) => r._id === replacementId)?.publicationStatus).toBe("draft");

    await organizerT.mutation(api.recordings.publish, { eventId, recordingId: replacementId });
    const after = await organizerT.query(api.recordings.get, { eventId, agendaItemId });
    expect(after.recordings.find((r) => r._id === replacementId)?.publicationStatus).toBe("published");
    expect(after.recordings.find((r) => r._id === originalId)?.publicationStatus).toBe("draft");
  });

  it("blocks detaching a published recording", async () => {
    const t = convexTest(schema, modules);
    const { organizerT, eventId, agendaItemId } = await seedEvent(t, { endTime: Date.now() - 1000 });
    const recordingId = await organizerT.mutation(api.recordings.attachHosted, { eventId, agendaItemId, hostedUrl: "https://vimeo.com/76979871" });
    await organizerT.mutation(api.recordings.publish, { eventId, recordingId });
    await expect(
      organizerT.mutation(api.recordings.detach, { eventId, recordingId }),
    ).rejects.toThrow(/Unpublish/);
  });
});

describe("migrateLegacy", () => {
  it("converts a valid legacy videoUrl into a private draft and is idempotent on rerun", async () => {
    const t = convexTest(schema, modules);
    const { organizerT, eventId, agendaItemId } = await seedEvent(t, { endTime: Date.now() - 1000 });
    await t.run(async (ctx) => {
      await ctx.db.patch(agendaItemId, { videoUrl: "https://vimeo.com/76979871" });
    });

    const first = await organizerT.mutation(api.recordings.migrateLegacy, { eventId });
    expect(first).toEqual({ created: 1, skipped: 0, invalid: 0 });

    const detail = await organizerT.query(api.recordings.get, { eventId, agendaItemId });
    const migrated = detail.recordings.find((r) => r.legacySource === "agenda_video_url");
    expect(migrated?.publicationStatus).toBe("draft");

    const second = await organizerT.mutation(api.recordings.migrateLegacy, { eventId });
    expect(second).toEqual({ created: 0, skipped: 1, invalid: 0 });
  });

  it("counts an invalid legacy videoUrl instead of throwing", async () => {
    const t = convexTest(schema, modules);
    const { organizerT, eventId, agendaItemId } = await seedEvent(t, { endTime: Date.now() - 1000 });
    await t.run(async (ctx) => {
      await ctx.db.patch(agendaItemId, { videoUrl: "not a url" });
    });
    const result = await organizerT.mutation(api.recordings.migrateLegacy, { eventId });
    expect(result).toEqual({ created: 0, skipped: 0, invalid: 1 });
  });
});
