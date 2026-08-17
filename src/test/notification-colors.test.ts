import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(join(process.cwd(), "src", "components", file), "utf8");

describe("notification color semantics", () => {
  it("uses the shared electric-blue info token for unread notification indicators", () => {
    const bell = source("NotificationBell.tsx");
    const panel = source("NotificationPanel.tsx");

    expect(bell).toContain("bg-info");
    expect(bell).toContain("text-info-foreground");
    expect(bell).not.toContain("bg-success");
    expect(panel).toContain('bg-info" aria-label="Unread"');
    expect(panel).not.toMatch(/bg-\[#40745C\]/i);
  });
});
