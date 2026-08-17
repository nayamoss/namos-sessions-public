import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AirtableIntegrationForm } from "@/components/shared/AirtableIntegrationForm";
import type { ContentIntegration, EventId } from "@/data/types";

const mocks = vi.hoisted(() => {
  const contentIntegrations = {
    status: vi.fn(),
    connectAirtable: vi.fn(),
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
    mocks.contentIntegrations.connectAirtable.mockResolvedValue({ status: "connected" });
    mocks.contentIntegrations.importAirtable.mockResolvedValue({ created: 2, updated: 1, skipped: 1, hasMore: true });
    mocks.contentIntegrations.disconnect.mockResolvedValue({ status: "disconnected" });
  });

  it("connects, imports with a visible summary, and disconnects behind confirmation", async () => {
    render(<AirtableIntegrationForm eventId={eventId} />);

    const connectButton = await screen.findByRole("button", { name: "Connect" });
    expect(connectButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Personal Access Token"), { target: { value: " pat_test_1234 " } });
    fireEvent.change(screen.getByLabelText("Base ID"), { target: { value: " appBase " } });
    fireEvent.change(screen.getByLabelText("Table Name"), { target: { value: " Speakers " } });
    expect(connectButton).toBeEnabled();
    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(mocks.contentIntegrations.connectAirtable).toHaveBeenCalledWith({
        eventId,
        personalAccessToken: "pat_test_1234",
        baseId: "appBase",
        tableName: "Speakers",
        target: "speakers",
      });
    });

    const importButton = await screen.findByRole("button", { name: "Import now" });
    fireEvent.click(importButton);
    expect(await screen.findByText(/2 created, 1 updated/)).toHaveTextContent("1 skipped");
    expect(screen.getByText("More rows remain — click Import now again.")).toBeInTheDocument();
    expect(mocks.contentIntegrations.importAirtable).toHaveBeenCalledWith({ eventId });

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    const confirmation = await screen.findByRole("alertdialog");
    expect(within(confirmation).getByText("Disconnect Airtable?")).toBeInTheDocument();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Disconnect" }));

    await waitFor(() => {
      expect(mocks.contentIntegrations.disconnect).toHaveBeenCalledWith({ eventId, provider: "airtable" });
    });
    expect(await screen.findByRole("button", { name: "Connect" })).toBeDisabled();
  });

  it("keeps the form available and shows a specific connection error inline", async () => {
    mocks.contentIntegrations.status.mockReset().mockResolvedValue(null);
    mocks.contentIntegrations.connectAirtable.mockRejectedValue(
      new Error("That personal access token isn't valid, or doesn't have access to this base."),
    );
    render(<AirtableIntegrationForm eventId={eventId} />);

    await screen.findByRole("button", { name: "Connect" });
    fireEvent.change(screen.getByLabelText("Personal Access Token"), { target: { value: "pat_invalid" } });
    fireEvent.change(screen.getByLabelText("Base ID"), { target: { value: "appBase" } });
    fireEvent.change(screen.getByLabelText("Table Name"), { target: { value: "Speakers" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That personal access token isn't valid, or doesn't have access to this base.",
    );
    expect(screen.getByLabelText("Personal Access Token")).toHaveValue("pat_invalid");
  });
});
