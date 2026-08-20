import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(join(process.cwd(), "src", file), "utf8");

describe("secondary copy contract", () => {
  it("does not expose helper-copy props from shared form fields or section cards", () => {
    expect(source("components/shared/FormField.tsx")).not.toMatch(/\bhint\??:/);
    expect(source("components/shared/ToggleField.tsx")).not.toMatch(/\bhint\??:/);
    expect(source("components/shared/SectionCard.tsx")).not.toMatch(/\bdescription\??:/);
  });

  it("keeps helper-copy props out of shared-component call sites", () => {
    const files = [
      "pages/settings/EventTeam.tsx",
      "pages/settings/ComponentShowcase.tsx",
      "pages/program/SubmissionFormBuilder.tsx",
    ];
    const violations = files.filter((file) => /<(?:FormField|ToggleField|SectionCard)[\s\S]{0,240}?(?:hint|description)=/.test(source(file)));
    expect(violations).toEqual([]);
  });

  it("renders the speaker access empty state once instead of duplicating route content", () => {
    const layout = source("pages/portal/PortalLayout.tsx");
    expect(layout).toContain("!selectedSpeaker ? (");
    expect(layout).toContain(") : children}");
  });
});
