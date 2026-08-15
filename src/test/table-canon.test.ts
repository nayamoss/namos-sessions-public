import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = join(process.cwd(), "src");
const canonicalTable = "components/shared/DataGrid.tsx";
// The public schedule grid is a semantic timetable, rather than a generic data
// table, so it intentionally owns its table markup.
const semanticTables = new Set(["components/embeds/EmbedRenderer.tsx"]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "test" ? [] : sourceFiles(path);
    return /\.(?:tsx|jsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("table component canon", () => {
  it("keeps generic native table markup inside DataGrid", () => {
    const violations = sourceFiles(sourceRoot).flatMap((file) => {
      const projectPath = relative(sourceRoot, file).replaceAll("\\", "/");
      if (projectPath === canonicalTable || semanticTables.has(projectPath)) return [];
      const source = readFileSync(file, "utf8");
      return source.includes("<" + "table") ? [projectPath] : [];
    });

    expect(violations).toEqual([]);
  });

  it("does not expose a second generic table component", () => {
    const componentFiles = sourceFiles(join(sourceRoot, "components"))
      .map((file) => relative(sourceRoot, file).replaceAll("\\", "/"));
    expect(componentFiles).not.toContain("components/ui/table.tsx");
  });
});
