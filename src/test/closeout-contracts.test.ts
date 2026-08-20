import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("UI and CRUD closeout contracts", () => {
  it("registers canonical create and edit routes for primary records", () => {
    const app = source("src/App.tsx");
    for (const route of [
      "program/speakers/new", "program/speakers/:speakerId/edit",
      "program/abstracts/new", "program/abstracts/:abstractId/edit",
      "program/agenda/new", "program/agenda/:agendaId/edit",
      "program/sponsors/new", "program/sponsors/:sponsorId/edit",
      "program/contacts/new", "program/contacts/:contactId/edit",
      "portals/forms/new", "portals/tasks/new", "portals/resources/new",
      "settings/task-templates/new", "cms/embeds/:embedId/edit",
    ]) expect(app).toContain(`path="${route}"`);
  });

  it("keeps profile names backward compatible while making last name optional", () => {
    const schema = source("convex/schema.ts");
    const mutation = source("convex/userProfiles.ts");
    expect(schema).toContain("firstName: v.optional(v.string())");
    expect(schema).toContain("lastName: v.optional(v.string())");
    expect(mutation).toContain("patch.displayName = [firstName, lastName]");
  });

  it("uses the persisted event accent color in the event switcher", () => {
    const switcher = source("src/components/EventSwitcher.tsx");
    expect(switcher).toContain("current?.accentColor");
    expect(switcher).toContain("event.accentColor");
  });

  it("persists configurable readiness categories with backward-compatible defaults", () => {
    expect(source("convex/schema.ts")).toContain("readinessCategories: v.optional");
    expect(source("src/pages/program/Readiness.tsx")).toContain("event.readinessCategories ??");
    expect(source("src/App.tsx")).toContain('path="settings/readiness"');
  });

  it("keeps the settings modal as a destination hub rather than an embedded settings form", () => {
    const modal = source("src/components/settings/SettingsModal.tsx");
    expect(modal).toContain("SETTINGS_NAV_GROUPS");
    expect(modal).not.toContain("const panels");
    expect(modal).not.toContain("<Panel");
  });

  it("keeps form focus states free of solid borders and rings", () => {
    const input = source("src/components/ui/input.tsx");
    const styles = source("src/index.css");
    expect(input).toContain("focus-visible:bg-accent");
    expect(input).not.toContain("focus-visible:ring-");
    expect(styles).toContain("input:focus-visible");
    expect(styles).toContain("border: none !important");
    expect(styles).toContain("--tw-ring-shadow: none !important");
  });

  it("keeps embedded tables inside the page scroll instead of creating nested scrollbars", () => {
    const grid = source("src/components/shared/DataGrid.tsx");
    const speakers = source("src/pages/program/Speakers.tsx");
    expect(grid).toContain('? "overflow-x-auto"');
    expect(grid).not.toContain('max-h-[calc(100dvh-11rem)] overflow-auto');
    expect(speakers).not.toContain("minWidth={columns.reduce");
  });
});
