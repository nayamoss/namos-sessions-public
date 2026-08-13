import { describe, expect, it } from "vitest";
import appSource from "@/App.tsx?raw";
import {
  GO_TO_SEQUENCES,
  formatShortcut,
  matchesShortcut,
} from "@/lib/shortcuts";

function keyboardEvent(code: string, init: KeyboardEventInit = {}) {
  return new KeyboardEvent("keydown", { code, ...init });
}

describe("keyboard shortcut definitions", () => {
  it("requires an exact modifier match", () => {
    const binding = { code: "KeyK", meta: true };

    expect(matchesShortcut(keyboardEvent("KeyK", { metaKey: true }), binding)).toBe(true);
    expect(matchesShortcut(keyboardEvent("KeyK", { metaKey: true, shiftKey: true }), binding)).toBe(false);
  });

  it("formats modifier and punctuation tokens", () => {
    expect(formatShortcut({ code: "KeyK", meta: true })).toEqual(["⌘", "K"]);
    expect(formatShortcut({ code: "Slash" })).toEqual(["/"]);
  });

  it("only points go-to sequences at registered application routes", () => {
    for (const sequence of GO_TO_SEQUENCES) {
      expect(appSource, `${sequence.to} should be registered in App.tsx`).toContain(sequence.to);
    }
  });
});
