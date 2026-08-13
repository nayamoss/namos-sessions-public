import { describe, expect, it } from "vitest";
import { speakerTrackingSummary } from "@/lib/speaker-tracking";
describe("speaker tracking", () => it("surfaces missing profile work and task totals", () => expect(speakerTrackingSummary([{ bio: "Bio", headshotStorageKey: "headshot/a.jpg", outstandingTasks: 1 }, { outstandingTasks: 2 }])).toEqual({ total: 2, missingBio: 1, missingHeadshot: 1, outstandingTasks: 3 })));
