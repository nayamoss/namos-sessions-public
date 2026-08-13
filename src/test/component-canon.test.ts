import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = join(process.cwd(), "src");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "test" ? [] : sourceFiles(path);
    return /\.(?:tsx|jsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("shared component canon", () => {
  it("keeps visible native form controls inside reusable UI components", () => {
    const allowed = new Set([
      "components/ui/input.tsx",
      "components/ui/textarea.tsx",
      // Hidden platform controls are intentional accessibility/file fallbacks.
      "pages/onboarding/steps/ImportDataStep.tsx",
      "pages/public/Embeds.tsx",
    ]);
    const violations = sourceFiles(sourceRoot).flatMap((file) => {
      const projectPath = relative(sourceRoot, file).replaceAll("\\", "/");
      if (allowed.has(projectPath)) return [];
      const source = readFileSync(file, "utf8");
      return /<(?:input|textarea|select)\b/.test(source) ? [projectPath] : [];
    });
    expect(violations).toEqual([]);
  });

  it("does not allow page-local copies of canonical component names", () => {
    const violations = sourceFiles(join(sourceRoot, "pages")).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      const copies = [...source.matchAll(/function\s+(Card|Field|Toggle|ErrorList|StatusPill|EmptyState|Segmented)\s*\(/g)]
        .map((match) => match[1]);
      return copies.length ? [`${relative(sourceRoot, file).replaceAll("\\", "/")}: ${copies.join(", ")}`] : [];
    });
    expect(violations).toEqual([]);
  });

  it("keeps hardcoded neutral palettes out of product UI", () => {
    const violations = sourceFiles(sourceRoot).flatMap((file) => {
      const projectPath = relative(sourceRoot, file).replaceAll("\\", "/");
      if (projectPath === "pages/public/ApiDocs.tsx") return [];
      const source = readFileSync(file, "utf8");
      return /(?:bg|text)-neutral-|dark:bg-\[#[0-9a-f]{6}\]/i.test(source) ? [projectPath] : [];
    });
    expect(violations).toEqual([]);
  });
});
