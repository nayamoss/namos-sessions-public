import { describe, expect, it } from "vitest";
import { submissionConfirmationEmail } from "@/lib/confirmation-email";
describe("submission confirmation", () => it("always includes a walkable portal link", () => expect(submissionConfirmationEmail({ speakerName: "Ada", eventName: "AI.Engineer", sessionTitle: "Reliable programs", portalUrl: "https://example.test/portal" })).toMatchObject({ subject: "We received your submission for AI.Engineer", portalUrl: "https://example.test/portal" })));
