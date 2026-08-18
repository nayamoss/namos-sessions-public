import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { NamosSessionsApiError, NamosSessionsClient, type SubmissionStatus } from "@namos-sessions/sdk";

type Client = Pick<NamosSessionsClient, "events" | "submissions" | "speakers" | "agenda" | "tasks">;
type ResourceName = "events" | "submissions" | "speakers" | "agenda" | "tasks";

const resourceScopes: Record<ResourceName, string> = {
  events: "events:read", submissions: "submissions:read", speakers: "speakers:read", agenda: "agenda:read", tasks: "tasks:read",
};
const resourceUris: Record<ResourceName, string> = {
  events: "namos-sessions://events", submissions: "namos-sessions://submissions", speakers: "namos-sessions://speakers", agenda: "namos-sessions://agenda", tasks: "namos-sessions://tasks",
};

function messageFor(error: unknown): string { return error instanceof Error ? error.message : "Unknown error."; }
function isForbidden(error: unknown): boolean { return error instanceof NamosSessionsApiError && error.status === 403; }

async function readResource(client: Client, name: ResourceName, eventId: string): Promise<unknown[]> {
  if (name === "events") return client.events.list();
  if (name === "submissions") return client.submissions.list(eventId);
  if (name === "speakers") return client.speakers.list(eventId);
  if (name === "agenda") return client.agenda.list(eventId);
  return client.tasks.list(eventId);
}

/**
 * Builds and registers a real MCP server (@modelcontextprotocol/sdk) over the Namos Sessions
 * REST API, via the SDK client — no direct Convex access, so it can never grant more than the
 * token's own REST scopes would. Resources/tools are registered only for scopes the token
 * actually has (probed once at startup), never advertised then refused — matching how a real
 * MCP client is expected to discover capability.
 */
export async function buildServer(client: Client): Promise<McpServer> {
  // This validates the configured token before the server advertises any MCP capability.
  let events: Awaited<ReturnType<Client["events"]["list"]>>;
  try {
    events = await client.events.list();
  } catch (error) {
    throw new Error(`NAMOS_SESSIONS_TOKEN is invalid, revoked, or lacks events:read: ${messageFor(error)}`);
  }
  const eventId = events[0]?.id ?? "mcp-scope-probe";

  const readable = new Set<ResourceName>(["events"]);
  await Promise.all((Object.keys(resourceScopes) as ResourceName[]).filter((name) => name !== "events").map(async (name) => {
    try { await readResource(client, name, eventId); readable.add(name); }
    catch (error) { if (!isForbidden(error)) throw new Error(`Unable to initialize ${name} resource: ${messageFor(error)}`); }
  }));

  // A deliberately nonexistent id is safe: the REST handler checks scope before lookup and
  // returns 404 for a permitted token, so no real submission can be changed by this probe.
  let canWrite = false;
  try {
    await client.submissions.updateStatus("__namos_mcp_scope_probe__", "draft", { idempotencyKey: randomUUID() });
    canWrite = true;
  } catch (error) {
    if (isForbidden(error)) canWrite = false;
    else if (error instanceof NamosSessionsApiError && error.status === 404) canWrite = true;
    else throw new Error(`Unable to initialize update_submission_status tool: ${messageFor(error)}`);
  }

  const server = new McpServer({ name: "namos-sessions", version: "0.1.0" });

  for (const name of readable) {
    server.registerResource(
      name,
      resourceUris[name],
      { title: name, description: `Namos Sessions ${name} available to this token (${resourceScopes[name]}).`, mimeType: "application/json" },
      async (uri) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(await readResource(client, name, eventId)) }] }),
    );
  }

  if (canWrite) {
    server.registerTool(
      "update_submission_status",
      {
        title: "Update submission status",
        description: "Update a submission's status.",
        inputSchema: {
          submissionId: z.string(),
          status: z.enum(["draft", "pending", "accept_queue", "accepted", "maybe", "decline_queue", "declined", "withdrawn"]),
        },
      },
      async ({ submissionId, status }) => {
        try {
          const data = await client.submissions.updateStatus(submissionId, status as SubmissionStatus, { idempotencyKey: randomUUID() });
          return { content: [{ type: "text", text: JSON.stringify(data) }] };
        } catch (error) {
          const message = error instanceof NamosSessionsApiError ? error.message : messageFor(error);
          return { content: [{ type: "text", text: message }], isError: true };
        }
      },
    );
  }

  return server;
}

export async function createServerFromEnvironment(env: NodeJS.ProcessEnv = process.env, createClient: (options: { token: string; baseUrl: string }) => Client = (options) => new NamosSessionsClient(options)): Promise<McpServer> {
  const token = env.NAMOS_SESSIONS_TOKEN;
  const baseUrl = env.NAMOS_SESSIONS_URL;
  if (!token) throw new Error("NAMOS_SESSIONS_TOKEN is required to start namos-sessions-mcp.");
  if (!baseUrl) throw new Error("NAMOS_SESSIONS_URL is required to start namos-sessions-mcp.");
  try { new URL(baseUrl); } catch { throw new Error("NAMOS_SESSIONS_URL must be a valid URL."); }
  return buildServer(createClient({ token, baseUrl }));
}
