import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { SettingsSidebarNav } from "@/components/settings/SettingsSidebarNav";

describe("settings navigation", () => {
  it("keeps the shared event library destination", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onTabChange = vi.fn();

    act(() => root.render(
      <SettingsSidebarNav activeTab="event" onTabChange={onTabChange} />,
    ));

    expect(container.querySelector("nav")).toHaveTextContent("Library");

    const libraryButton = [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.trim() === "Library");
    expect(libraryButton).toBeDefined();
    act(() => libraryButton?.click());
    expect(onTabChange).toHaveBeenCalledWith("library");

    act(() => root.unmount());
    container.remove();
  });
});
