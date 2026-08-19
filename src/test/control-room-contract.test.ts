import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "convex/controlRoom.ts"), "utf8");

describe("Control Room backend contract", () => {
  it("authorizes the event and projects all eight live issue categories", () => {
    expect(source).toContain("assertEventOrganizerAccess(ctx, eventId)");
    for (const category of ["decisions", "reviews", "acceptance_emails", "overdue_tasks", "missing_assets", "unscheduled", "conflicts", "publication_blockers"])
      expect(source).toContain(category);
  });

  it("links individual records to their owning resolution surfaces", () => {
    expect(source).toContain("program/abstracts?selected=");
    expect(source).toContain("program/evaluation?assignment=");
    expect(source).toContain("portals/tasks?selected=");
    expect(source).toContain("program/speakers?selected=");
    expect(source).toContain("program/agenda?view=conflicts&selected=");
  });

  it("completes publishing only for the guided session and an enabled speaker gallery", () => {
    expect(source).toContain('embed.view === "speaker_gallery" && embed.enabled');
    expect(source).toContain("walkthroughAgendaItem?.isPublished === true && speakerGalleryEnabled");
    expect(source).toContain("`${base}/cms/embeds`");
    const publishStep = source.slice(source.indexOf('{ id: "publish"'), source.indexOf("],", source.indexOf('{ id: "publish"')));
    expect(publishStep).not.toContain("publicationBlockers");
  });
});
