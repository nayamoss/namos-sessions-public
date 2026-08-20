import { describe, expect, it } from "vitest";
import { createAirtableTransport } from "@/data/airtable";
import { defaultEmbed, embedViewLabels, iframeHeight, iframeSnippet, isHexColor, publicEmbedOrigin, publicEmbedUrl } from "@/lib/public-embed";
import type { EmbedId, EventId } from "@/data/types";

describe("saved public embed helpers", () => {
  const id = "k57j59xq5q6yyx123" as EmbedId;
  it("uses only an opaque embed id in permanent URLs and copy-ready iframe code", () => {
    expect(publicEmbedOrigin("https://app.example")).toBe("https://app.example");
    expect(publicEmbedUrl("https://app.example", id)).toBe("https://app.example/embed/k57j59xq5q6yyx123");
    expect(iframeSnippet("https://app.example", id, "speaker_gallery")).toContain('loading="lazy"');
    expect(iframeSnippet("https://app.example", id, "speaker_gallery")).toContain('referrerpolicy="strict-origin-when-cross-origin"');
    expect(iframeSnippet("https://app.example", id, "speaker_gallery")).toContain("Namos Sessions");
    expect(iframeSnippet("https://app.example", id, "speaker_gallery")).not.toContain("eventId");
  });
  it("labels all six views and gives each a numeric iframe height", () => {
    expect(Object.values(embedViewLabels)).toEqual(["Agenda", "Schedule itinerary", "Schedule grid", "Session list", "Speaker gallery", "Speaker list"]);
    expect(Object.keys(embedViewLabels).every((view) => Number.isInteger(iframeHeight(view as keyof typeof embedViewLabels)))).toBe(true);
  });
  it("starts with a coral, valid and required-field-safe configuration", () => {
    const embed = defaultEmbed("event" as EventId);
    expect(embed.primaryColor).toBe("#E56B5D");
    expect(embed.fields.agenda).toMatchObject({ title: true, time: true, room: true });
    expect(isHexColor("#E56B5D")).toBe(true);
    expect(isHexColor("blue")).toBe(false);
  });
  it("makes Airtable fail closed for every embed operation", async () => {
    await expect(createAirtableTransport().read("publicEmbeds.getPublic", { embedId: id })).rejects.toThrow("Public embed management is available on the Convex backend.");
  });
});
