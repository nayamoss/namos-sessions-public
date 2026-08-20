import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const demoSurfaces = [
  "src/pages/public/DemoLandingPage.tsx",
  "src/pages/public/DemoProofPage.tsx",
  "src/pages/public/DemoInboxPage.tsx",
  "src/components/demo/DemoWorkspaceBar.tsx",
  "src/pages/dashboard/DashboardHome.tsx",
  "src/pages/program/AgentOperations.tsx",
  "src/pages/program/Agenda.tsx",
  "src/pages/program/Evaluation.tsx",
  "src/pages/program/Communications.tsx",
  "src/pages/portal/PortalResources.tsx",
];

describe("judge demo UI invariants", () => {
  it("does not render visible native select controls on proof or workflow surfaces", () => {
    for (const file of demoSurfaces) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/<select(?:\s|>)/);
    }
  });

  it("keeps the demo landing header identity-only", () => {
    const source = readFileSync("src/pages/public/DemoLandingPage.tsx", "utf8");
    const header = source.match(/<header[^>]*>([\s\S]*?)<\/header>/)?.[1] ?? "";
    expect(header).toContain("Namos Sessions");
    expect(header).not.toMatch(/<(?:button|input|select|Link)\b/);
  });
});
