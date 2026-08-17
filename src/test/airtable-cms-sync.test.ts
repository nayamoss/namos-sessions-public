import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mapAirtableRecordToSpeaker,
  mapAirtableRecordToSubmission,
  queryAirtableTable,
  verifyAirtableConnection,
} from "../../convex/airtableSync";
import { createRepository, type DataTransport } from "@/data/transport";
import type { EventId } from "@/data/types";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Airtable CMS sync", () => {
  it("maps speaker fields and creates the idempotent Airtable source reference", () => {
    expect(mapAirtableRecordToSpeaker({
      id: "recSpeaker1",
      fields: {
        Name: "Ada Lovelace",
        Email: " ADA@EXAMPLE.COM ",
        Bio: "Mathematician",
        LinkedIn: "https://linkedin.example/ada",
        Website: "https://ada.example",
      },
    })).toEqual({
      sourceRef: "airtable:recSpeaker1",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      bio: "Mathematician",
      linkedinUrl: "https://linkedin.example/ada",
      websiteUrl: "https://ada.example",
    });
  });

  it("skips speakers without email and submissions without title", () => {
    expect(mapAirtableRecordToSpeaker({ id: "rec1", fields: { Name: "No Email" } })).toBeNull();
    expect(mapAirtableRecordToSubmission({ id: "rec2", fields: { Status: "Accepted" } })).toBeNull();
  });

  it("maps submission fields, statuses, and source references", () => {
    expect(mapAirtableRecordToSubmission({
      id: "recSubmission1",
      fields: { Title: "Practical AI", Status: "Accepted", Notes: "Main stage" },
    })).toEqual({
      sourceRef: "airtable:recSubmission1",
      title: "Practical AI",
      status: "accepted",
      notes: "Main stage",
    });
    expect(mapAirtableRecordToSubmission({
      id: "recSubmission2",
      fields: { Title: "Unknown status", Status: "Maybe" },
    })?.status).toBe("pending");
  });

  it("validates through the requested base and table without persisting a credential", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ records: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await verifyAirtableConnection("pat_test", "appBase", "Speaker Roster");

    const [request, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(request.toString()).toBe("https://api.airtable.com/v0/appBase/Speaker%20Roster?maxRecords=1");
    expect(init.headers).toEqual({ authorization: "Bearer pat_test" });
  });

  it("sends the stored offset and returns Airtable's next offset", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      records: [{ id: "rec1", fields: { Email: "ada@example.com" } }],
      offset: "itrNextPage",
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(queryAirtableTable("pat_test", "appBase", "Speakers", "itrCurrentPage")).resolves.toEqual({
      records: [{ id: "rec1", fields: { Email: "ada@example.com" } }],
      offset: "itrNextPage",
    });
    const [request] = fetchMock.mock.calls[0] as [URL];
    expect(request.searchParams.get("pageSize")).toBe("100");
    expect(request.searchParams.get("offset")).toBe("itrCurrentPage");
  });

  it("routes Airtable status, connect, import, and disconnect through provider-aware operations", async () => {
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
    const eventId = "event_test" as EventId;

    await repo.contentIntegrations.status({ eventId, provider: "airtable" });
    await repo.contentIntegrations.connectAirtable({
      eventId,
      personalAccessToken: "pat_test",
      baseId: "appBase",
      tableName: "Speakers",
      target: "speakers",
    });
    await repo.contentIntegrations.importAirtable({ eventId });
    await repo.contentIntegrations.disconnect({ eventId, provider: "airtable" });

    expect(calls).toEqual([
      { operation: "contentIntegrations.status", input: { eventId, provider: "airtable" } },
      {
        operation: "contentIntegrations.connectAirtable",
        input: { eventId, personalAccessToken: "pat_test", baseId: "appBase", tableName: "Speakers", target: "speakers" },
      },
      { operation: "contentIntegrations.importAirtable", input: { eventId } },
      { operation: "contentIntegrations.disconnect", input: { eventId, provider: "airtable" } },
    ]);
  });

  it.each([
    [401, "That personal access token isn't valid, or doesn't have access to this base."],
    [403, "That personal access token isn't valid, or doesn't have access to this base."],
    [404, "That base or table wasn't found — check the base ID and table name."],
    [429, "Airtable rate limit reached. Try again shortly."],
  ])("surfaces the designed Airtable error for HTTP %i", async (status, message) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
    await expect(verifyAirtableConnection("pat_test", "appBase", "Speakers")).rejects.toThrow(message);
  });
});
