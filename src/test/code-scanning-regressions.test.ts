import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const formBuilderSource = readFileSync(
  join(process.cwd(), "src/pages/program/SubmissionFormBuilder.tsx"),
  "utf8",
);
const portalDataSource = readFileSync(
  join(process.cwd(), "src/pages/portal/portal-data.ts"),
  "utf8",
);
const portalPagesSource = readFileSync(
  join(process.cwd(), "src/pages/portal/PortalPages.tsx"),
  "utf8",
);

describe("CodeQL regression boundaries", () => {
  it("renders an uploaded logo from its canonical storage URL", () => {
    expect(formBuilderSource).not.toContain("URL.createObjectURL(file)");
    expect(formBuilderSource).toContain("repo.files.getUrl(storageId)");
  });

  it("does not persist speaker profiles in browser storage", () => {
    expect(portalDataSource).not.toMatch(/localStorage|sessionStorage/);
    expect(portalPagesSource).not.toMatch(/savePortalProfile|loadPortalProfile/);
    expect(portalPagesSource).not.toMatch(/localStorage|sessionStorage/);
  });
});
