import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { isDemoIdentity } from "./functions";

const modules = import.meta.glob("./**/*.ts");
const demoIdentity = { subject: "demo-organizer", email: "demo@example.test" };

async function seed(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const organizationId = await ctx.db.insert("organizations", { name: "Demo", createdByUserId: demoIdentity.subject, createdAt: now });
    await ctx.db.insert("organizers", { organizationId, userId: demoIdentity.subject, email: demoIdentity.email, role: "owner", createdAt: now });
    const eventId = await ctx.db.insert("events", { organizationId, name: "Demo", slug: "demo", timezone: "UTC", startDate: now, endDate: now, exhibitorsEnabled: false, sponsorsEnabled: false, status: "draft", createdAt: now, updatedAt: now });
    const runId = await ctx.db.insert("agent_runs", { eventId, requestedByUserId: demoIdentity.subject, objective: "Check", status: "needs_approval", model: "test", idempotencyKey: "test-key", stepCount: 0, maxSteps: 1, createdAt: now, updatedAt: now });
    const proposalId = await ctx.db.insert("agent_action_proposals", { eventId, runId, kind: "create_tasks", tasks: [], payloadHash: "hash", summary: "Test", status: "pending", proposedByToolCallId: "tool", createdAt: now, updatedAt: now });
    await ctx.db.insert("demo_workspaces", { workspaceId: "workspace", organizationId, eventId, organizerUserId: demoIdentity.subject, reviewerUserId: "demo-reviewer", speakerUserId: "demo-speaker", organizerEmail: demoIdentity.email, reviewerEmail: "reviewer@example.test", speakerEmail: "speaker@example.test", activeRole: "organizer", createdAt: now, lastActiveAt: now, expiresAt: now + 60_000, absoluteExpiresAt: now + 60_000 });
    return { eventId, runId, proposalId };
  });
}

describe("demo mutation guard", () => {
  it("blocks write modules and every Operations Agent mutation", async () => {
    const t = convexTest(schema, modules);
    const { eventId, runId, proposalId } = await seed(t);
    const demo = t.withIdentity(demoIdentity);
    const blocked = (call: Promise<unknown>) => expect(call).rejects.toThrow(/demo_read_only|read-only demo/);

    await blocked(demo.mutation(api.agenda.publishSchedule, { eventId }));
    await blocked(demo.mutation(api.tags.create, { eventId, name: "Demo" }));
    await blocked(demo.mutation(api.comms.saveTemplate, { eventId, name: "Demo", kind: "custom", subject: "Subject", body: "Body" }));
    await blocked(demo.mutation(api.agentRuns.create, { eventId, objective: "Check the event", idempotencyKey: "agent-key" }));
    await blocked(demo.mutation(api.agentRuns.respond, { eventId, runId, message: "Continue", idempotencyKey: "reply-key" }));
    await blocked(demo.mutation(api.agentRuns.retry, { eventId, runId }));
    await blocked(demo.mutation(api.agentRuns.cancel, { eventId, runId }));
    await blocked(demo.mutation(api.agentRuns.approveTaskProposal, { eventId, proposalId, expectedPayloadHash: "hash" }));
    await blocked(demo.mutation(api.agentRuns.approveMessageProposal, { eventId, proposalId, expectedPayloadHash: "hash" }));
    await blocked(demo.mutation(api.agentRuns.rejectProposal, { eventId, proposalId }));
  });

  it("does not affect non-demo identities", async () => {
    const t = convexTest(schema, modules);
    const { eventId } = await seed(t);
    const real = t.withIdentity({ subject: "real-organizer", email: "real@example.test" });
    await t.run(async (ctx) => {
      const event = await ctx.db.get(eventId);
      if (!event?.organizationId) throw new Error("Missing organization");
      await ctx.db.insert("organizers", { organizationId: event.organizationId, userId: "real-organizer", email: "real@example.test", role: "owner", createdAt: Date.now() });
    });
    await expect(real.mutation(api.tags.create, { eventId, name: "Allowed" })).resolves.toBeTruthy();
  });

  it("fails closed when demo identity lookup throws", async () => {
    await expect(isDemoIdentity({ db: { query: () => { throw new Error("database unavailable"); } } } as never, demoIdentity as never)).resolves.toBe(true);
  });
});
