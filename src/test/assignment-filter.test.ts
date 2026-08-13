import { describe, expect, it } from "vitest";
import { isAssignableSubmission, matchSubmissionsForFilter } from "@/lib/assignment-filter";
import type { EventId, FormId, Submission, SubmissionStatus, TagId } from "@/data/types";

const eventId = "event-a" as EventId;
const aiTag = "tag-ai" as TagId;
const opsTag = "tag-ops" as TagId;

function submission(id: string, overrides: Partial<Submission> = {}): Submission {
  return { id: id as Submission["id"], eventId, formId: "form-a" as FormId, speakerIds: [], tagIds: [], status: "pending", ...overrides };
}

describe("bulk assignment filter predicate", () => {
  it("matches every eligible submission carrying the tag", () => {
    const rows = [
      submission("a", { tagIds: [aiTag] }),
      submission("b", { tagIds: [opsTag, aiTag] }),
      submission("c", { tagIds: [opsTag] }),
    ];
    expect(matchSubmissionsForFilter(rows, { kind: "tag", tagId: aiTag }).map(row => row.id)).toEqual(["a", "b"]);
  });

  it("never matches a submission with no tags at all", () => {
    const rows = [submission("a"), submission("b", { tagIds: [] })];
    expect(matchSubmissionsForFilter(rows, { kind: "tag", tagId: aiTag })).toEqual([]);
  });

  it("matches on track id and ignores untracked submissions", () => {
    const rows = [
      submission("a", { trackId: "track-1" }),
      submission("b", { trackId: "track-2" }),
      submission("c"),
    ];
    expect(matchSubmissionsForFilter(rows, { kind: "track", trackId: "track-1" }).map(row => row.id)).toEqual(["a"]);
  });

  it("excludes drafts and withdrawals even when they carry the tag", () => {
    const rows = [
      submission("draft", { status: "draft", tagIds: [aiTag] }),
      submission("withdrawn", { status: "withdrawn", tagIds: [aiTag] }),
      submission("live", { status: "accepted", tagIds: [aiTag] }),
    ];
    expect(matchSubmissionsForFilter(rows, { kind: "tag", tagId: aiTag }).map(row => row.id)).toEqual(["live"]);
  });

  it("treats every other status as eligible", () => {
    const statuses: SubmissionStatus[] = ["pending", "accept_queue", "accepted", "decline_queue", "declined"];
    for (const status of statuses) expect(isAssignableSubmission({ status })).toBe(true);
    expect(isAssignableSubmission({ status: "draft" })).toBe(false);
    expect(isAssignableSubmission({ status: "withdrawn" })).toBe(false);
  });
});
