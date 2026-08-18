import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { IntegrationCard } from "@/components/settings/IntegrationCard";

describe("integration brand icons", () => {
  it.each([
    ["resend", "Resend"],
    ["amazon_ses", "Amazon SES"],
    ["operations_agent", "Operations Agent AI"],
    ["notion", "Notion"],
    ["airtable", "Airtable"],
    ["sanity", "Sanity"],
  ] as const)("renders the %s provider mark", (provider, name) => {
    const onOpen = vi.fn();
    const { container } = render(
      <IntegrationCard
        provider={provider}
        name={name}
        description={`${name} integration`}
        status="not_connected"
        onOpen={onOpen}
      />,
    );

    const card = screen.getByRole("button", { name: new RegExp(name, "i") });
    expect(container.querySelector(`[data-integration-provider="${provider}"] svg`)).toBeTruthy();

    fireEvent.click(card);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("keeps coming-soon integrations inert", () => {
    const onOpen = vi.fn();
    render(
      <IntegrationCard
        provider="sanity"
        name="Sanity"
        description="Sanity integration"
        status="not_connected"
        comingSoon
        onOpen={onOpen}
      />,
    );

    expect(screen.getByRole("button", { name: /sanity/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /sanity/i }));
    expect(onOpen).not.toHaveBeenCalled();
  });
});
