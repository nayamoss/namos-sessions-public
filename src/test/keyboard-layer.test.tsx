import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClerkProvider } from "@clerk/clerk-react";
import { AppLayout } from "@/components/AppLayout";
import { GlobalKeyboardShortcuts } from "@/components/GlobalKeyboardShortcuts";
import { isKeyboardShortcutBlocked } from "@/lib/shortcuts";
import { TEST_CLERK_PUBLISHABLE_KEY } from "./clerk-test-key";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("keyboard layer", () => {
  it("blocks shortcuts across every supported typing surface and while a dialog is open", () => {
    const typingSurfaces = ["input", "textarea", "select"].map((tag) => document.createElement(tag));
    for (const [attribute, value] of [
      ["contenteditable", "true"],
      ["role", "textbox"],
      ["role", "combobox"],
      ["role", "searchbox"],
      ["cmdk-root", ""],
    ]) {
      const surface = document.createElement("div");
      surface.setAttribute(attribute, value);
      typingSurfaces.push(surface);
    }

    for (const surface of typingSurfaces) {
      surface.tabIndex = 0;
      document.body.append(surface);
      surface.focus();
      expect(isKeyboardShortcutBlocked(document), surface.outerHTML).toBe(true);
      surface.remove();
    }

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.append(dialog);
    expect(isKeyboardShortcutBlocked(document)).toBe(true);

    dialog.setAttribute("aria-hidden", "true");
    expect(isKeyboardShortcutBlocked(document)).toBe(false);
  });

  it("registers exactly one document keydown listener", () => {
    const addListener = vi.spyOn(document, "addEventListener");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => root.render(
      <MemoryRouter>
        <GlobalKeyboardShortcuts onOpenCommandPalette={() => undefined} />
      </MemoryRouter>,
    ));

    expect(addListener.mock.calls.filter(([eventName]) => eventName === "keydown")).toHaveLength(1);
    act(() => root.unmount());
  });

  it("opens the command palette from the keyboard and the sidebar affordance", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => root.render(
      <ClerkProvider publishableKey={TEST_CLERK_PUBLISHABLE_KEY}>
        <MemoryRouter>
          <AppLayout title="Abstracts"><p>Content</p></AppLayout>
        </MemoryRouter>
      </ClerkProvider>,
    ));

    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyK", metaKey: true })));
    expect(document.querySelector('input[aria-label="Command palette"]')).toBeInTheDocument();

    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape" })));
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Open command palette"]')!;
    act(() => trigger.click());
    expect(document.querySelector('input[aria-label="Command palette"]')).toBeInTheDocument();

    act(() => root.unmount());
  });
});
