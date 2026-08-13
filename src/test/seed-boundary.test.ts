import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("demo seeder boundary", () => {
  it("keeps privileged fixture writes behind an internal Convex mutation", () => {
    const source = readFileSync(resolve(process.cwd(), "convex/seed.ts"), "utf8");

    expect(source).toContain('import { internalMutation } from "./_generated/server"');
    expect(source).toMatch(/export const demo = internalMutation\s*\(/);
    expect(source).not.toMatch(/export const demo = (?:query|mutation|action)\s*\(/);
  });
});
