import { describe, expect, it, vi } from "vitest";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { NamosSessionsApiError } from "@namos-sessions/sdk";
import { buildServer, createServerFromEnvironment } from "./server.js";

const forbidden = () => new NamosSessionsApiError(403, { code: "forbidden", message: "This token does not have the submissions:write scope.", details: null });
function sdkClient(overrides: Record<string, unknown> = {}): object {
  return {
    events: { list: vi.fn().mockResolvedValue([{ id: "event-1", name: "Namos" }]) },
    submissions: { list: vi.fn().mockResolvedValue([{ _id: "submission-1", title: "Session" }]), updateStatus: vi.fn().mockRejectedValue(forbidden()) },
    speakers: { list: vi.fn().mockResolvedValue([{ _id: "speaker-1", firstName: "Naya" }]) },
    agenda: { list: vi.fn().mockResolvedValue([]) },
    tasks: { list: vi.fn().mockResolvedValue([]) },
    ...overrides,
  };
}

/** Connects the built McpServer to a real MCP Client over an in-memory transport pair — this
 * exercises the actual @modelcontextprotocol/sdk protocol handshake and message framing, not a
 * hand-rolled stand-in for it. */
async function connected(sdk: object) {
  const server = await buildServer(sdk as never);
  const client = new McpClient({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

describe("Namos Sessions MCP server", () => {
  it("fails clearly before startup when the token is missing or invalid", async () => {
    await expect(createServerFromEnvironment({ NAMOS_SESSIONS_URL: "https://sessions.example" })).rejects.toThrow("NAMOS_SESSIONS_TOKEN is required");
    const invalid = sdkClient({ events: { list: vi.fn().mockRejectedValue(new NamosSessionsApiError(401, { code: "unauthorized", message: "Invalid or revoked API token.", details: null })) } });
    await expect(createServerFromEnvironment({ NAMOS_SESSIONS_TOKEN: "bad", NAMOS_SESSIONS_URL: "https://sessions.example" }, () => invalid as never)).rejects.toThrow("invalid, revoked, or lacks events:read");
  });

  it("reads an advertised resource through the real MCP protocol and returns JSON-shaped SDK data", async () => {
    const sdk = sdkClient() as { submissions: { list: ReturnType<typeof vi.fn> } };
    const { client } = await connected(sdk);
    const { resources } = await client.listResources();
    expect(resources).toEqual(expect.arrayContaining([expect.objectContaining({ uri: "namos-sessions://submissions" })]));
    const read = await client.readResource({ uri: "namos-sessions://submissions" });
    expect(read.contents).toEqual([{ uri: "namos-sessions://submissions", mimeType: "application/json", text: JSON.stringify([{ _id: "submission-1", title: "Session" }]) }]);
    expect(sdk.submissions.list).toHaveBeenLastCalledWith("event-1");
  });

  it("omits the write tool entirely when submissions:write is denied", async () => {
    const { client } = await connected(sdkClient());
    // No tool is ever registered for a scope-lacking token, so the server never advertises a
    // "tools" capability at all — the same "never advertise, never allow" guarantee the REST
    // API gives. A client can't even call tools/list, let alone the tool itself.
    expect(client.getServerCapabilities()?.tools).toBeUndefined();
  });

  it("grants the write tool and calls the SDK when submissions:write is present", async () => {
    const sdk = sdkClient({ submissions: { list: vi.fn().mockResolvedValue([]), updateStatus: vi.fn().mockResolvedValue({ _id: "submission-1", status: "accepted" }) } });
    const { client } = await connected(sdk);
    const { tools } = await client.listTools();
    expect(tools).toEqual(expect.arrayContaining([expect.objectContaining({ name: "update_submission_status" })]));
    const result = await client.callTool({ name: "update_submission_status", arguments: { submissionId: "submission-1", status: "accepted" } });
    expect(result.content).toEqual([{ type: "text", text: JSON.stringify({ _id: "submission-1", status: "accepted" }) }]);
  });
});
