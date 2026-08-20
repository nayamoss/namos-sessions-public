import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentProviderSettingsForm } from "@/components/shared/AgentProviderSettingsForm";
import type { AgentProviderSetting, EventId } from "@/data/types";

const mocks = vi.hoisted(() => {
  const agentProviderSettings = {
    status: vi.fn(),
    saveManaged: vi.fn(),
    saveByok: vi.fn(),
    disconnectByok: vi.fn(),
    assignBillingOwner: vi.fn(),
  };
  return { repo: { agentProviderSettings }, agentProviderSettings };
});

vi.mock("@/data/repo", () => ({
  useRepo: () => mocks.repo,
}));

const eventId = "event-disabled" as EventId;
const disabledSetting: AgentProviderSetting = {
  eventId,
  mode: "managed",
  provider: "openai",
  status: "disabled",
  managedAvailable: false,
  managedDisabled: true,
  billingOwnerAssigned: true,
  updatedAt: 0,
};

describe("managed AI disabled provider state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.agentProviderSettings.status.mockResolvedValue(disabledSetting);
  });

  it("explains the temporary outage and leaves BYOK selectable", async () => {
    render(<AgentProviderSettingsForm eventId={eventId} />);

    expect(await screen.findByText("Temporarily disabled")).toBeInTheDocument();
    expect(screen.getByText("Managed AI is temporarily disabled. Bring your own key or contact support.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save AI provider" })).toBeDisabled();

    fireEvent.click(screen.getByRole("radio", { name: "Bring your own key" }));
    expect(screen.getByLabelText("OpenAI API key")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save AI provider" })).toBeEnabled();
  });
});
