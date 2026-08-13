import { describe, expect, it } from "vitest";
import { defaultAbstractGridPreferences, moveAbstractGridColumn, normalizeAbstractGridPreferences, toggleAbstractGridColumn } from "@/lib/abstract-grid-preferences";

const columns = ["status", "title", "speaker"] as const;

describe("abstract grid column preferences", () => {
  it("keeps a usable, complete order when a saved preference is stale", () => {
    expect(normalizeAbstractGridPreferences({ order: ["speaker", "removed", "speaker"], hidden: ["removed", "title"] }, columns)).toEqual({ order: ["speaker", "status", "title"], hidden: ["title"] });
  });

  it("moves selected columns without changing visibility", () => {
    expect(moveAbstractGridColumn({ order: ["status", "title", "speaker"], hidden: ["title"] }, "speaker", -1)).toEqual({ order: ["status", "speaker", "title"], hidden: ["title"] });
  });

  it("does not permit hiding the last visible column", () => {
    const onlyStatus = { order: [...columns], hidden: ["title", "speaker"] };
    expect(toggleAbstractGridColumn(onlyStatus, "status")).toEqual(onlyStatus);
    expect(toggleAbstractGridColumn(defaultAbstractGridPreferences(columns), "title")).toEqual({ order: [...columns], hidden: ["title"] });
  });
});
