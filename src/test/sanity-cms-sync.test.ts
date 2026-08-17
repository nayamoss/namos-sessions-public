import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSanitySessionDocument,
  buildSanitySpeakerDocument,
  publishSanityBatch,
  verifySanityConnection,
} from "../../convex/sanitySync";
import { createRepository, type DataTransport } from "@/data/transport";
import type { EventId } from "@/data/types";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Sanity CMS sync", () => {
  it("builds the fixed deterministic session and speaker document shapes", () => {
    expect(buildSanitySessionDocument({
      _id: "agenda_1",
      title: "Opening keynote",
      startTime: Date.UTC(2026, 7, 16, 14),
      endTime: Date.UTC(2026, 7, 16, 15),
      speakerIds: ["speaker_1"],
      videoUrl: "https://video.example/keynote",
    })).toEqual({
      _type: "namosSession",
      _id: "namosSession-agenda_1",
      title: "Opening keynote",
      startTime: "2026-08-16T14:00:00.000Z",
      endTime: "2026-08-16T15:00:00.000Z",
      speakerRefs: [{ _type: "reference", _ref: "namosSpeaker-speaker_1" }],
      videoUrl: "https://video.example/keynote",
    });
    expect(buildSanitySpeakerDocument({
      _id: "speaker_1",
      firstName: "Ada",
      lastName: "Lovelace",
      bio: "Mathematician",
      linkedinUrl: "https://linkedin.example/ada",
    })).toEqual({
      _type: "namosSpeaker",
      _id: "namosSpeaker-speaker_1",
      name: "Ada Lovelace",
      bio: "Mathematician",
      linkedinUrl: "https://linkedin.example/ada",
    });
  });

  it("validates both read access and write permission before connection", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ transactionId: "dry-run" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await verifySanityConnection("token_test", "project123", "production");

    const [queryUrl, queryInit] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(queryUrl.toString()).toBe("https://project123.api.sanity.io/v2023-05-03/data/query/production?query=*%5B0%5D");
    expect(queryInit.headers).toMatchObject({ authorization: "Bearer token_test" });
    const [mutateUrl, mutateInit] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(mutateUrl.searchParams.get("returnIds")).toBe("true");
    expect(JSON.parse(String(mutateInit.body))).toEqual({ mutations: [] });
  });

  it("rejects a read-only token during connect validation", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 403 })));
    await expect(verifySanityConnection("read_only", "project123", "production")).rejects.toThrow(
      "That token doesn't have write access — create one with Editor permissions in manage.sanity.io.",
    );
  });

  it("isolates validation failures after a failed batch and keeps valid documents", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { description: "Batch invalid" } }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ transactionId: "ok" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { description: "Unknown type namosSpeaker" } }), { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    const documents = [
      { name: "Keynote", document: buildSanitySessionDocument({ _id: "a1", title: "Keynote", startTime: 0, endTime: 1, speakerIds: [] }) },
      { name: "Ada Lovelace", document: buildSanitySpeakerDocument({ _id: "s1", firstName: "Ada", lastName: "Lovelace" }) },
    ];

    await expect(publishSanityBatch("token", "project123", "production", documents)).resolves.toEqual({
      successfulIds: ["namosSession-a1"],
      failures: [{ name: "Ada Lovelace", reason: "Unknown type namosSpeaker" }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("routes Sanity status, connect, publish, and disconnect through provider-aware operations", async () => {
    const calls: { operation: string; input: object }[] = [];
    const transport: DataTransport = {
      async read<Result>(operation, input) {
        calls.push({ operation, input });
        return null as Result;
      },
      async write<Result>(operation, input) {
        calls.push({ operation, input });
        return { status: "connected" } as Result;
      },
    };
    const repo = createRepository(transport);
    const eventId = "event_sanity" as EventId;

    await repo.contentIntegrations.status({ eventId, provider: "sanity" });
    await repo.contentIntegrations.connectSanity({ eventId, projectId: "project123", dataset: "production", apiToken: "token" });
    await repo.contentIntegrations.publishSanity({ eventId });
    await repo.contentIntegrations.disconnect({ eventId, provider: "sanity" });

    expect(calls).toEqual([
      { operation: "contentIntegrations.status", input: { eventId, provider: "sanity" } },
      { operation: "contentIntegrations.connectSanity", input: { eventId, projectId: "project123", dataset: "production", apiToken: "token" } },
      { operation: "contentIntegrations.publishSanity", input: { eventId } },
      { operation: "contentIntegrations.disconnect", input: { eventId, provider: "sanity" } },
    ]);
  });

  it.each([
    [401, "That API token isn't valid."],
    [404, "That project ID or dataset wasn't found."],
  ])("surfaces the designed Sanity read-validation error for HTTP %i", async (status, message) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
    await expect(verifySanityConnection("token", "project123", "production")).rejects.toThrow(message);
  });
});
