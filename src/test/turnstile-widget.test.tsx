import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TurnstileWidget } from "@/components/security/TurnstileWidget";

describe("TurnstileWidget", () => {
  const renderWidget = vi.fn();
  const reset = vi.fn();
  const remove = vi.fn();

  beforeEach(() => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "test-sitekey");
    renderWidget.mockImplementation((_container, options) => {
      options.callback("single-use-proof");
      return "widget-1";
    });
    window.turnstile = { render: renderWidget, reset, remove };
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    delete window.turnstile;
  });

  it("reports a verified token, resets it after a failed submit, and removes the widget", async () => {
    const onToken = vi.fn();
    const view = render(<TurnstileWidget onToken={onToken} resetKey={0} />);

    await waitFor(() => expect(onToken).toHaveBeenCalledWith("single-use-proof"));
    expect(renderWidget).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ sitekey: "test-sitekey", action: "cfp-submit", theme: "auto" }));

    view.rerender(<TurnstileWidget onToken={onToken} resetKey={1} />);
    await waitFor(() => expect(reset).toHaveBeenCalledWith("widget-1"));
    expect(onToken).toHaveBeenCalledWith(null);

    view.unmount();
    expect(remove).toHaveBeenCalledWith("widget-1");
  });
});
