import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createRepository } from "@/data/transport";
import type { EventId } from "@/data/types";

const eventId = "event-a" as EventId;

describe("Operations Agent provider settings", () => {
  it("exposes managed, BYOK, disconnect, and legacy billing-owner assignment through explicit repository operations", async () => {
    const read = vi.fn().mockResolvedValue({ eventId, mode: "managed", provider: "openai", status: "ready", managedAvailable: true, managedDisabled: false, billingOwnerAssigned: true, updatedAt: 0 });
    const write = vi.fn().mockResolvedValue({ status: "ready" });
    const repo = createRepository({ read, write });
    await repo.agentProviderSettings.status({ eventId });
    await repo.agentProviderSettings.saveManaged({ eventId });
    await repo.agentProviderSettings.saveByok({ eventId, apiKey: "sk-test-organizer-key-value" });
    await repo.agentProviderSettings.disconnectByok({ eventId });
    await repo.agentProviderSettings.assignBillingOwner({ eventId });
    expect(read).toHaveBeenCalledWith("agentProviderSettings.status", { eventId });
    expect(write).toHaveBeenCalledWith("agentProviderSettings.saveManaged", { eventId });
    expect(write).toHaveBeenCalledWith("agentProviderSettings.saveByok", { eventId, apiKey: "sk-test-organizer-key-value" });
    expect(write).toHaveBeenCalledWith("agentProviderSettings.disconnectByok", { eventId });
    expect(write).toHaveBeenCalledWith("agentProviderSettings.assignBillingOwner", { eventId });
  });

  it("uses a dedicated encryption key and atomically reserves then settles managed allowances", () => {
    const secrets = readFileSync("convex/agentProviderSecrets.ts", "utf8");
    const billing = readFileSync("convex/agentBilling.ts", "utf8");
    const resolver = readFileSync("convex/agentBillingResolver.ts", "utf8");
    const runtime = readFileSync("convex/agentRuntime.ts", "utf8");
    expect(secrets).toContain("AI_INTEGRATION_ENCRYPTION_KEY");
    expect(secrets).not.toContain("EMAIL_INTEGRATION_ENCRYPTION_KEY");
    expect(billing).toContain("reservedRuns");
    expect(billing).toContain("reservedTokens");
    expect(billing).toContain("export const settle");
    expect(billing).toContain("export const release");
    expect(resolver).toContain("getUserBillingSubscription");
    expect(resolver).toContain("CLERK_AGENT_PLAN_ALLOWANCES");
    expect(runtime).toContain("internal.agentBilling.reserve");
    expect(runtime).toContain("internal.agentBilling.settle");
    expect(runtime).toContain("internal.agentBilling.release");
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

  it("does not promise that a configured managed key has already passed a provider run", () => {
    const form = readFileSync("src/components/shared/AgentProviderSettingsForm.tsx", "utf8");
    expect(form).toContain('? "Configured"');
    expect(form).toContain('? "Verified"');
  });

  it("keeps Airtable explicitly unsupported", () => {
    const adapter = readFileSync("src/data/airtable/index.ts", "utf8");
    expect(adapter).toContain('operation.startsWith("agentProviderSettings.")');
    expect(adapter).toContain("no encrypted credential store");
  });
});
