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
  return {
    container,
    trigger: () => container.querySelector<HTMLButtonElement>('button[aria-label^="Submission status:"]')!,
    cleanup: () => { act(() => root.unmount()); container.remove(); },
  };
}

describe("StatusTabs", () => {
  it("uses a compact filter menu instead of a horizontal status strip", () => {
    const view = renderTabs();
    const trigger = view.trigger();

    expect(view.container.querySelector('[role="tablist"]')).toBeNull();
    expect(trigger).toHaveTextContent(/Filter\s*All/);

    expect(trigger).toHaveAttribute("aria-label", "Submission status: All");
    view.cleanup();
  });
});
