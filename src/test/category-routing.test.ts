import { describe, expect, it } from "vitest";
import { evaluateRoutingRules, removeSponsorRoutingTarget, validateRoutingRules, type SubmissionRoutingRule } from "../../convex/categoryRouting";

const rule = (values: Partial<SubmissionRoutingRule> & Pick<SubmissionRoutingRule, "id" | "equals">): SubmissionRoutingRule => ({
  fieldId: "category-field",
  ...values,
});

describe("category routing", () => {
  it("keeps the default route when no rule matches", () => {
    const result = evaluateRoutingRules([
      rule({ id: "sponsor", equals: "Sponsor", setStatus: "accept_queue" }),
    ], { "category-field": "Community" });

    expect(result).toEqual({});
  });

  it("applies every target from a single matching rule", () => {
    const result = evaluateRoutingRules([
      rule({
        id: "sponsor",
        equals: "Sponsor",
        assignTagIds: ["tag-sponsor" as never],
        assignTrackId: "track-sponsor" as never,
        assignSponsorId: "sponsor-convex" as never,
        setStatus: "accept_queue",
        reviewerUserIds: ["Reviewer 1"],
      }),
    ], { "category-field": "Sponsor" });

    expect(result).toEqual({
      assignTagIds: ["tag-sponsor"],
      assignTrackId: "track-sponsor",
      assignSponsorId: "sponsor-convex",
      setStatus: "accept_queue",
      reviewerUserIds: ["Reviewer 1"],
    });
  });

  it("merges multiple matches in order and lets later scalar targets win", () => {
    const result = evaluateRoutingRules([
      rule({ id: "first", equals: "Sponsor", assignTagIds: ["tag-sponsor" as never], assignTrackId: "track-general" as never, assignSponsorId: "sponsor-community" as never, setStatus: "pending", reviewerUserIds: ["Reviewer 1"] }),
      rule({ id: "second", equals: "Sponsor", assignTagIds: ["tag-priority" as never], assignTrackId: "track-sponsor" as never, assignSponsorId: "sponsor-convex" as never, setStatus: "accept_queue", reviewerUserIds: ["Reviewer 1", "Reviewer 2"] }),
    ], { "category-field": "[\"Sponsor\",\"Keynote\"]" });

    expect(result).toEqual({
      assignTagIds: ["tag-sponsor", "tag-priority"],
      assignTrackId: "track-sponsor",
      assignSponsorId: "sponsor-convex",
      setStatus: "accept_queue",
      reviewerUserIds: ["Reviewer 1", "Reviewer 2"],
    });
  });

  it("rejects a sponsor target owned by another event", async () => {
    const fieldId = "category-field";
    const sponsorId = "sponsor-other";
    const ctx = {
      db: {
        get: async (id: string) => id === sponsorId ? { _id: sponsorId, eventId: "event-other" } : null,
        query: (table: string) => ({
          collect: async () => table === "field_definitions" ? [{ _id: fieldId, type: "dropdown", label: "Category", options: ["Sponsor"] }] : [],
        }),
      },
    };

    await expect(validateRoutingRules(ctx as never, "event-a" as never, [{ fieldIds: [fieldId] }], [
      rule({ id: "sponsor", equals: "Sponsor", assignSponsorId: sponsorId as never }),
    ])).rejects.toThrow("Every routing sponsor must belong to this event.");
  });

  it("clears a deleted sponsor from routing rules without changing other targets", () => {
    const sponsorId = "sponsor-deleted" as never;
    const rules = [
      rule({ id: "sponsor", equals: "Sponsor", assignSponsorId: sponsorId, assignTagIds: ["tag-sponsor" as never], setStatus: "accept_queue" }),
      rule({ id: "community", equals: "Community", assignSponsorId: "sponsor-kept" as never }),
    ];

    expect(removeSponsorRoutingTarget(rules, sponsorId)).toEqual([
      rule({ id: "sponsor", equals: "Sponsor", assignTagIds: ["tag-sponsor" as never], setStatus: "accept_queue" }),
      rules[1],
    ]);
  });
});
