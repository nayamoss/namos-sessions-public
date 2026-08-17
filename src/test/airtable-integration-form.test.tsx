import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AirtableIntegrationForm } from "@/components/shared/AirtableIntegrationForm";
import type { ContentIntegration, EventId } from "@/data/types";

const mocks = vi.hoisted(() => {
  const contentIntegrations = {
    status: vi.fn(),
    connectAirtable: vi.fn(),
    startOAuth: vi.fn(),
    importAirtable: vi.fn(),
    disconnect: vi.fn(),
  };
  return { contentIntegrations, repo: { contentIntegrations } };
});

vi.mock("@/data/repo", () => ({
  useRepo: () => mocks.repo,
}));

const eventId = "event_airtable" as EventId;
const connectedIntegration: ContentIntegration = {
  id: "integration_airtable",
  eventId,
  provider: "airtable",
  target: "speakers",
  credentialHint: "1234",
  status: "connected",
  updatedAt: Date.now(),
};

describe("Airtable integration form", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.contentIntegrations.status.mockResolvedValueOnce(null).mockResolvedValue(connectedIntegration);
    mocks.contentIntegrations.startOAuth.mockResolvedValue({ url: "https://airtable.com/oauth2/v1/authorize?client_id=test" });
    mocks.contentIntegrations.importAirtable.mockResolvedValue({ created: 2, updated: 1, skipped: 1, hasMore: true });
    mocks.contentIntegrations.disconnect.mockResolvedValue({ status: "disconnected" });
  });

  it("starts the Airtable OAuth flow without exposing token or base-ID inputs", async () => {
    render(<AirtableIntegrationForm eventId={eventId} />);

    const connectButton = await screen.findByRole("button", { name: "Connect with Airtable" });
    expect(screen.queryByLabelText("Personal Access Token")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Base ID")).not.toBeInTheDocument();
    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(mocks.contentIntegrations.startOAuth).toHaveBeenCalledWith({ eventId, provider: "airtable", target: "speakers" });
    });
  });

  it("keeps the OAuth button available and shows a connection error inline", async () => {
    mocks.contentIntegrations.status.mockReset().mockResolvedValue(null);
    mocks.contentIntegrations.startOAuth.mockRejectedValue(new Error("Airtable OAuth is not configured."));
    render(<AirtableIntegrationForm eventId={eventId} />);

    fireEvent.click(await screen.findByRole("button", { name: "Connect with Airtable" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Airtable OAuth is not configured.");
  });
});
