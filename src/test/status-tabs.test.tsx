import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { StatusTabs } from "@/components/shared/StatusTabs";

const tabs = [
  { value: "all", label: "All", count: 12 },
  { value: "accepted", label: "Accepted", count: 4 },
  { value: "pending", label: "Pending", count: 8 },
];

function TabsHarness() {
  const [value, setValue] = useState("all");
  return <StatusTabs ariaLabel="Submission status" tabs={tabs} value={value} onValueChange={setValue} />;
}

function renderTabs() {
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  act(() => root.render(<TabsHarness />));
  const tab = (label: string) => Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((button) => button.textContent?.startsWith(label))!;
  return {
    container,
    tab,
    cleanup: () => { act(() => root.unmount()); container.remove(); },
  };
}

describe("StatusTabs", () => {
  it("keeps tabs in a single scrollable row and changes the active tab", () => {
    const view = renderTabs();
    const all = view.tab("All");
    const accepted = view.tab("Accepted");

    expect(view.container.querySelector("[data-status-tabs-scroll]")).toHaveClass("overflow-x-auto");
    expect(view.container.querySelector('[role="tablist"]')).toHaveClass("flex-nowrap");
    expect(all).toHaveAttribute("aria-selected", "true");

    act(() => accepted.click());

    expect(accepted).toHaveAttribute("aria-selected", "true");
    expect(all).toHaveAttribute("aria-selected", "false");
    view.cleanup();
  });

  it("supports arrow, Home, and End keyboard navigation", () => {
    const view = renderTabs();
    const all = view.tab("All");
    const accepted = view.tab("Accepted");
    const pending = view.tab("Pending");

    all.focus();
    act(() => all.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(accepted).toHaveFocus();
    expect(accepted).toHaveAttribute("aria-selected", "true");

    act(() => accepted.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
    expect(pending).toHaveFocus();
    expect(pending).toHaveAttribute("aria-selected", "true");

    act(() => pending.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })));
    expect(all).toHaveFocus();
    expect(all).toHaveAttribute("aria-selected", "true");
    view.cleanup();
  });
});
