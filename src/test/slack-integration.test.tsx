import { createHmac } from "node:crypto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SlackIntegrationForm } from "@/components/shared/SlackIntegrationForm";
import { RepoContext } from "@/data/repo";
import { createRepository, type DataTransport } from "@/data/transport";
import { decryptSlackToken, encryptSlackToken, safeSlackError, sha256Base64Url, verifySlackRequest } from "../../convex/slackSecurity";
import { verifySlackRequestWeb } from "../../convex/slackRequestVerification";
import { listConversations, SlackApiError } from "../../convex/slackClient";
import type { EventId } from "@/data/types";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks(); delete process.env.SLACK_INTEGRATION_ENCRYPTION_KEY; });

describe("Slack request security", () => {
  it("accepts only an unchanged, current, equal-length signature", async () => {
    const timestamp = "1755600000";
    const nowMs = 1_755_600_000_000;
    const rawBody = "team_id=T1&command=%2Fnamos&text=status";
    const signingSecret = "test-signing-secret";
    const signature = `v0=${createHmac("sha256", signingSecret).update(`v0:${timestamp}:${rawBody}`).digest("hex")}`;
    expect(verifySlackRequest({ rawBody, timestamp, signature, signingSecret, nowMs })).toBe(true);
    expect(await verifySlackRequestWeb({ rawBody, timestamp, signature, signingSecret, nowMs })).toBe(true);
    expect(verifySlackRequest({ rawBody: `${rawBody}x`, timestamp, signature, signingSecret, nowMs })).toBe(false);
    expect(verifySlackRequest({ rawBody, timestamp: "not-an-integer", signature, signingSecret, nowMs })).toBe(false);
    expect(verifySlackRequest({ rawBody, timestamp, signature: `${signature}00`, signingSecret, nowMs })).toBe(false);
    expect(verifySlackRequest({ rawBody, timestamp, signature, signingSecret, nowMs: nowMs + 301_000 })).toBe(false);
    expect(verifySlackRequest({ rawBody, timestamp, signature, signingSecret, nowMs: nowMs - 301_000 })).toBe(false);
  });

  it("hashes link tokens, encrypts bot tokens, and redacts Slack credentials", () => {
    process.env.SLACK_INTEGRATION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const envelope = encryptSlackToken("xoxb-secret-token");
    expect(envelope.ciphertext).not.toContain("xoxb-secret-token");
    expect(decryptSlackToken(envelope)).toBe("xoxb-secret-token");
    expect(sha256Base64Url("one-time-link")).not.toContain("one-time-link");
    expect(safeSlackError(new Error("Bearer xoxb-secret-token failed"))).toBe("Bearer [redacted] failed");
  });
});

describe("Slack Web API client", () => {
  it("paginates channels, normalizes flags, and sorts safely", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, channels: [{ id: "C2", name: "zeta", is_private: true, is_member: false }], response_metadata: { next_cursor: "next" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, channels: [{ id: "C1", name: "alpha", is_private: false, is_member: true }], response_metadata: { next_cursor: "" } }), { status: 200 }));
    expect(await listConversations("xoxb-test")).toEqual([
      { id: "C1", name: "alpha", isPrivate: false, isMember: true, isArchived: false },
      { id: "C2", name: "zeta", isPrivate: true, isMember: false, isArchived: false },
    ]);
  });

  it("classifies rate limits without leaking the token", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, error: "ratelimited" }), { status: 429, headers: { "retry-after": "9" } }));
    await expect(listConversations("xoxb-never-print-this")).rejects.toMatchObject({ code: "ratelimited", retryable: true, retryAfterSeconds: 9 } satisfies Partial<SlackApiError>);
  });
});

describe("Slack settings account linking", () => {
  it("removes the raw link token from the URL before showing the result", async () => {
    window.history.replaceState({}, "", "/events/test-event/settings/integrations?keep=1&slack_link=raw-secret-token");
    const writes: Array<{ operation: string; input: object }> = [];
    const transport: DataTransport = {
      read: async (operation) => operation === "slackIntegrations.status" ? { state: "not_connected" } as never : null as never,
      write: async (operation, input) => {
        writes.push({ operation, input });
        if (operation === "slackIntegrations.claimLink") return { linked: true, teamName: "Sandbox" } as never;
        throw new Error(`Unexpected operation: ${operation}`);
      },
    };
    render(<RepoContext.Provider value={createRepository(transport)}><SlackIntegrationForm eventId={"event-1" as EventId} eventSlug="test-event" /></RepoContext.Provider>);
    await waitFor(() => expect(window.location.search).toBe("?keep=1"));
    expect(writes).toEqual([{ operation: "slackIntegrations.claimLink", input: { eventId: "event-1", token: "raw-secret-token" } }]);
    expect(await screen.findByText("Slack account linked for this event.")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("raw-secret-token");
  });

  it("renders the honest validation state when every capability is off", async () => {
    const transport: DataTransport = {
      read: async () => ({ state: "workspace_connected", workspaceId: "w1", teamId: "T1", teamName: "Sandbox", canDisconnectWorkspace: false, updatedAt: 1 }) as never,
      write: async (operation) => operation === "slackIntegrations.listChannels" ? { channels: [{ id: "C1", name: "ops", isPrivate: false, isMember: true }] } as never : null as never,
    };
    render(<RepoContext.Provider value={createRepository(transport)}><SlackIntegrationForm eventId={"event-1" as EventId} eventSlug="test-event" /></RepoContext.Provider>);
    fireEvent.click(await screen.findByRole("combobox", { name: "Event channel" }));
    fireEvent.click(await screen.findByText("#ops"));
    fireEvent.click(screen.getByRole("switch", { name: "Operations Agent" }));
    fireEvent.click(screen.getByRole("switch", { name: "Event notifications" }));
    expect(screen.getByText("Turn on the Operations Agent or at least one notification type.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save channel" })).toBeDisabled();
  });
});
