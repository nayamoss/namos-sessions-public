import { describe, expect, it } from "vitest";
import { parseOptionsDraft, sanitizeOptionsForSave } from "@/lib/form-builder-options";

describe("form-builder option drafts", () => {
  it("preserves a trailing blank line while the organizer types", () => {
    expect(parseOptionsDraft("Keynote\n")).toEqual(["Keynote", ""]);
    expect(parseOptionsDraft("Keynote\nWorkshop")).toEqual(["Keynote", "Workshop"]);
  });

  it("removes blank lines only when options are persisted", () => {
    expect(sanitizeOptionsForSave([" Keynote ", "", "  ", "Workshop"])).toEqual(["Keynote", "Workshop"]);
  });
});
