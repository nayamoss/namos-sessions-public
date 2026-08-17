import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { FunctionReference } from "convex/server";

const source = readFileSync(join(process.cwd(), "convex/seed.ts"), "utf8");
const internalSeedReference = internal.seed.demo;
type MatchesReference<T, Visibility extends "public" | "internal"> =
  T extends FunctionReference<"mutation", Visibility> ? true : false;
const publicApiHasCallableSeed: MatchesReference<typeof api.seed.demo, "public"> = false;
const internalApiHasCallableSeed: MatchesReference<typeof internal.seed.demo, "internal"> = true;

describe("demo seeder security boundary", () => {
  it("exports the seeder only as an internal Convex mutation", () => {
    expect(internalSeedReference).toBeDefined();
    expect(publicApiHasCallableSeed).toBe(false);
    expect(internalApiHasCallableSeed).toBe(true);
    expect(source).toContain('import { internalMutation } from "./_generated/server"');
    expect(source).toContain("export const demo = internalMutation(");
    expect(source).not.toMatch(/export\s+const\s+\w+\s*=\s*mutation\s*\(/);
    expect(source).not.toMatch(/import\s*\{[^}]*\bmutation\b[^}]*\}\s*from\s*["']\.\/functions["']/);
  });
});
