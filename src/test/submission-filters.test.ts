import { describe, expect, it } from "vitest";
import { filterSubmissionsByStatus } from "@/lib/submission-filters";
describe("submission status filters", () => it("filters an already-loaded dataset without fetching", () => expect(filterSubmissionsByStatus([{ status: "pending" as const }, { status: "accepted" as const }], "accepted")).toEqual([{ status: "accepted" }])));
