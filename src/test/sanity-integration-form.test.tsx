import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SanityIntegrationForm } from "@/components/shared/SanityIntegrationForm";
import type { ContentIntegration, EventId } from "@/data/types";

const mocks = vi.hoisted(() => {
  const contentIntegrations = {
    status: vi.fn(),
    connectSanity: vi.fn(),
    publishSanity: vi.fn(),
    disconnect: vi.fn(),
  };
  return { contentIntegrations, repo: { contentIntegrations } };
});

vi.mock("@/data/repo", () => ({
  useRepo: () => mocks.repo,
}));

const eventId = "event_sanity" as EventId;
const connectedIntegration: ContentIntegration = {
  id: "integration_sanity",
  eventId,
  provider: "sanity",
  target: "public_program",
  config: { sanityProjectId: "project123", sanityDataset: "production" },
  credentialHint: "1234",
  status: "connected",
  updatedAt: Date.now(),
};

describe("Sanity integration form", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.contentIntegrations.status.mockResolvedValueOnce(null).mockResolvedValue(connectedIntegration);
    mocks.contentIntegrations.connectSanity.mockResolvedValue({ status: "connected" });
    mocks.contentIntegrations.publishSanity.mockResolvedValue({
      published: 12,
      failed: 2,
      hasMore: true,
      failures: [
        { name: "Broken session", reason: "Unknown type namosSession" },
        { name: "Missing speaker", reason: "Unknown type namosSpeaker" },
      ],
    });
    mocks.contentIntegrations.disconnect.mockResolvedValue({ status: "disconnected" });
  });

  it("connects, publishes with expandable failures, and disconnects without promising deletion", async () => {
    render(<SanityIntegrationForm eventId={eventId} />);

    const connectButton = await screen.findByRole("button", { name: "Connect" });
    expect(connectButton).toBeDisabled();
    expect(screen.getByText(/Create an API token with Editor permissions/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Project ID"), { target: { value: " project123 " } });
    fireEvent.change(screen.getByLabelText("Dataset"), { target: { value: " production " } });
    fireEvent.change(screen.getByLabelText("API Token"), { target: { value: " token_1234 " } });
    expect(connectButton).toBeEnabled();
    fireEvent.click(connectButton);

    await waitFor(() => {
      expect(mocks.contentIntegrations.connectSanity).toHaveBeenCalledWith({
        eventId,
        projectId: "project123",
        dataset: "production",
        apiToken: "token_1234",
      });
    });

    const publishButton = await screen.findByRole("button", { name: "Publish now" });
    expect(screen.getByText(/Publishing to production/)).toBeInTheDocument();
    fireEvent.click(publishButton);
    expect(await screen.findByText("12 published, 2 failed")).toBeInTheDocument();
    expect(screen.getByText("More documents remain — click Publish now again.")).toBeInTheDocument();
    const failures = screen.getByText("View failures").closest("details");
    expect(failures).not.toBeNull();
    fireEvent.click(screen.getByText("View failures"));
    expect(failures).toHaveAttribute("open");
    expect(screen.getByText(/Unknown type namosSession/)).toBeInTheDocument();
    expect(mocks.contentIntegrations.publishSanity).toHaveBeenCalledWith({ eventId });

    expect(screen.getByText("Disconnecting stops future publishes — documents already in Sanity are not removed.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    const confirmation = await screen.findByRole("alertdialog");
    expect(within(confirmation).getByText(/Documents already in Sanity are not removed/)).toBeInTheDocument();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Disconnect" }));
    await waitFor(() => {
      expect(mocks.contentIntegrations.disconnect).toHaveBeenCalledWith({ eventId, provider: "sanity" });
    });
  });

  it("keeps credentials in the form and shows a read-only-token error inline", async () => {
    mocks.contentIntegrations.status.mockReset().mockResolvedValue(null);
    mocks.contentIntegrations.connectSanity.mockRejectedValue(
      new Error("That token doesn't have write access — create one with Editor permissions in manage.sanity.io."),
    );
    render(<SanityIntegrationForm eventId={eventId} />);

    await screen.findByRole("button", { name: "Connect" });
    fireEvent.change(screen.getByLabelText("Project ID"), { target: { value: "project123" } });
    fireEvent.change(screen.getByLabelText("Dataset"), { target: { value: "production" } });
    fireEvent.change(screen.getByLabelText("API Token"), { target: { value: "read_only" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That token doesn't have write access");
    expect(screen.getByLabelText("API Token")).toHaveValue("read_only");
  });
});
