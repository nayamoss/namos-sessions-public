import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createRepository } from "@/data/transport";
import type { EventId } from "@/data/types";

const eventId = "event-a" as EventId;

describe("Operations Agent provider settings", () => {
  it("exposes managed and BYOK through explicit repository operations", async () => {
    const read = vi.fn().mockResolvedValue({ eventId, mode: "managed", provider: "openai", status: "ready", managedAvailable: true, updatedAt: 0 });
    const write = vi.fn().mockResolvedValue({ status: "ready" });
    const repo = createRepository({ read, write });
    await repo.agentProviderSettings.status({ eventId });
    await repo.agentProviderSettings.saveManaged({ eventId });
    await repo.agentProviderSettings.saveByok({ eventId, apiKey: "sk-test-organizer-key-value" });
    expect(read).toHaveBeenCalledWith("agentProviderSettings.status", { eventId });
    expect(write).toHaveBeenCalledWith("agentProviderSettings.saveManaged", { eventId });
    expect(write).toHaveBeenCalledWith("agentProviderSettings.saveByok", { eventId, apiKey: "sk-test-organizer-key-value" });
  });

  it("keeps credentials out of the organizer projection and records managed usage as billable", () => {
    const settings = readFileSync("convex/agentProviderSettings.ts", "utf8");
    const runtime = readFileSync("convex/agentRuntime.ts", "utf8");
    expect(settings).not.toMatch(/return\s+\{[^}]*credentialEnvelope/s);
    expect(settings).toContain('billable: providerMode === "managed"');
    expect(runtime).toContain("decryptAgentApiKey");
    expect(runtime).toContain("agentProviderSettings.recordUsage");
    expect(runtime).toContain("[redacted]");
    expect(runtime).toContain("never use empty strings, zero, or placeholder values");
  });

  it("keeps Airtable explicitly unsupported", () => {
    const adapter = readFileSync("src/data/airtable/index.ts", "utf8");
    expect(adapter).toContain('operation.startsWith("agentProviderSettings.")');
    expect(adapter).toContain("no encrypted credential store");
  });
});
