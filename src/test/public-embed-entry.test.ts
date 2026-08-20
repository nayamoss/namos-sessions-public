import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("public embed entry", () => {
  it("renders opaque embed routes without initializing Clerk", () => {
    const main = readFileSync(join(process.cwd(), "src/main.tsx"), "utf8");
    const publicBranch = main.slice(
      main.indexOf("if (publicEmbedRoute)"),
      main.indexOf("} else if (publicDocsFallback)"),
    );
    expect(publicBranch).toContain("<PublicEmbedRepoProvider>");
    expect(publicBranch).toContain('path="/embed/:embedId"');
    expect(publicBranch).not.toContain("<ClerkProvider");
  });
});
