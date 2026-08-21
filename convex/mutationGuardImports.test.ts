import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The demo read-only guard (functions.ts's `mutation` export) only protects modules that
// import `mutation` from "./functions" — not the raw `_generated/server` export. A module
// that imports the raw one silently bypasses the guard entirely, as convex/slackIntegrations.ts
// did until this test was added. This scans every convex module for that exact mistake so it
// can never ship unnoticed again.
describe("demo mutation guard import hygiene", () => {
  it("no convex module imports `mutation` directly from _generated/server", () => {
    const dir = join(__dirname);
    const offenders: string[] = [];
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".ts") || file.endsWith(".test.ts") || file === "functions.ts") continue;
      if (readdirSync(dir, { withFileTypes: true }).find((entry) => entry.name === file)?.isDirectory()) continue;
      const source = readFileSync(join(dir, file), "utf8");
      const importsRawServer = /import\s*\{[^}]*\bmutation\b[^}]*\}\s*from\s*["']\.\/_generated\/server["']/.test(source);
      if (importsRawServer) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
