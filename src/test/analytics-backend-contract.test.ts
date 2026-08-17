import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("analytics backend contract", () => {
  it("keeps the Convex summary organizer-gated and event-indexed", () => {
    const source = readFileSync(join(process.cwd(), "convex/analytics.ts"), "utf8");
    expect(source).toContain("assertEventOrganizerAccess(ctx, eventId)");
    expect(source.match(/withIndex\("by_event"/g)).toHaveLength(7);
    expect(source).not.toContain("listMine");
  });

  it("keeps the browser contract count-only", () => {
    const source = readFileSync(join(process.cwd(), "src/data/types.ts"), "utf8");
    const contract = source.slice(source.indexOf("export interface EventAnalyticsSummary"), source.indexOf("export type CommTemplateKind"));
    expect(contract).not.toMatch(/\b(name|email|title|id|content|answer)s?\??:/i);
    expect(contract).toContain("history: { available: false; daily: [] }");
  });
});
