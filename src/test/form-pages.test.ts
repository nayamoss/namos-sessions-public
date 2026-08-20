import { describe, expect, it } from "vitest";
import { assertValidPages, derivePages, deriveSections } from "../../convex/formPages";

describe("submission form pages", () => {
  it("derives stable CFP pages from legacy sections", () => {
    const form = {
      _id: "form-legacy",
      kind: "abstract",
      collectParticipants: true,
      sections: [
        { id: "proposal", key: "abstract" as const, title: "Proposal", pageHeading: "Your proposal", description: "Details", fieldIds: ["title"] },
        { id: "people", key: "participant" as const, title: "Speakers", pageHeading: "Speakers", fieldIds: ["name"] },
      ],
    };

    const pages = derivePages(form);
    expect(pages.map((page) => [page.id, page.kind, page.systemRole])).toEqual([
      ["form-legacy-account", "system", "account"],
      ["proposal", "custom", undefined],
      ["form-legacy-participant", "system", "participant"],
      ["form-legacy-review", "system", "review"],
    ]);
    expect(derivePages(form)).toEqual(pages);
    expect(() => assertValidPages(pages, "abstract", true)).not.toThrow();
  });

  it("derives Portal forms as custom-page-only and preserves legacy content", () => {
    const pages = derivePages({
      _id: "portal-form",
      kind: "group",
      sections: [{ id: "organization", key: "portal", title: "Organization", pageHeading: "About your organization", description: "Tell us more", fieldIds: ["company"] }],
    });

    expect(pages).toEqual([{ id: "organization", kind: "custom", label: "Organization", pageHeading: "About your organization", description: "Tell us more", fieldIds: ["company"] }]);
    expect(() => assertValidPages(pages, "group", false)).not.toThrow();
  });

  it("gives an empty legacy CFP a valid organizer-owned proposal page", () => {
    const pages = derivePages({ _id: "empty-form", kind: "abstract", sections: [] });

    expect(pages.map((page) => [page.kind, page.systemRole, page.label])).toEqual([
      ["system", "account", "Account"],
      ["custom", undefined, "Proposal details"],
      ["system", "review", "Review"],
    ]);
    expect(() => assertValidPages(pages, "abstract", false)).not.toThrow();
    expect(() => assertValidPages(pages, "abstract", undefined as unknown as boolean)).not.toThrow();
  });

  it("gives participant-enabled legacy CFPs a participant page when the section is absent", () => {
    const pages = derivePages({
      _id: "participant-form",
      kind: "session",
      collectParticipants: true,
      sections: [{ id: "proposal", key: "abstract", title: "Proposal", pageHeading: "Proposal", fieldIds: [] }],
    });

    expect(pages.at(-2)).toMatchObject({
      kind: "system",
      systemRole: "participant",
      label: "Participant information",
    });
    expect(() => assertValidPages(pages, "session", true)).not.toThrow();
  });

  it("rejects missing, duplicated, or displaced CFP system anchors", () => {
    const valid = derivePages({ _id: "form-a", kind: "abstract", sections: [{ id: "proposal", key: "abstract", title: "Proposal", pageHeading: "Proposal", fieldIds: [] }] });
    expect(() => assertValidPages(valid.slice(1), "abstract", false)).toThrow("Account page must remain first");
    expect(() => assertValidPages([valid[0], valid[0], ...valid.slice(1)], "abstract", false)).toThrow("Page labels must be unique");
    expect(() => assertValidPages([valid[0], valid.at(-1)!, valid[1]], "abstract", false)).toThrow("Review page must remain last");
  });

  it("projects authoritative pages back to legacy sections during dual-write", () => {
    const customPages = [
      { id: "one", kind: "custom" as const, label: "First", pageHeading: "First", fieldIds: ["a"] },
      { id: "two", kind: "custom" as const, label: "Second", pageHeading: "Second", fieldIds: ["b"] },
    ];
    expect(deriveSections(customPages, "abstract").map((section) => section.key)).toEqual(["abstract", "abstract"]);
    expect(deriveSections(customPages, "group").map((section) => section.key)).toEqual(["portal", "portal"]);
  });
});
