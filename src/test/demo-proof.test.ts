import { describe, expect, it } from "vitest";
import {
  buildProofRequirements,
  readWalkthroughMedia,
  resolveProofDestination,
} from "@/lib/demo-proof";

describe("demo proof evidence", () => {
  it("defaults every requirement to NOT RUN instead of fabricating passes", () => {
    expect(buildProofRequirements("").every((item) => item.status === "NOT RUN")).toBe(true);
  });

  it("requires both a test name and direct route before displaying PASS", () => {
    const withoutTest = buildProofRequirements(JSON.stringify([{ id: "role-entry", status: "PASS" }]));
    expect(withoutTest[0].status).toBe("NOT RUN");
    const verified = buildProofRequirements(JSON.stringify([{ id: "role-entry", status: "PASS", testName: "demo entry e2e", proofRoute: "/demo/start#roles" }]));
    expect(verified[0]).toMatchObject({ status: "PASS", testName: "demo entry e2e", proofRoute: "/demo/start#roles" });
  });

  it("rejects external proof-route overrides", () => {
    const result = buildProofRequirements(JSON.stringify([{ id: "role-entry", status: "PASS", testName: "demo entry e2e", proofRoute: "https://untrusted.example" }]));
    expect(result[0].proofRoute).toBe("/demo/start#roles");
    const protocolRelative = buildProofRequirements(JSON.stringify([{ id: "role-entry", status: "PASS", testName: "demo entry e2e", proofRoute: "//untrusted.example" }]));
    expect(protocolRelative[0].proofRoute).toBe("/demo/start#roles");
  });

  it("sends signed-out visitors through demo creation instead of protected routes", () => {
    const controlRoom = buildProofRequirements("").find((item) => item.id === "control-room")!;
    expect(resolveProofDestination(controlRoom, null)).toEqual({
      label: "Start a demo to verify",
      route: "/demo?proof=control-room",
      createsContext: true,
    });
  });

  it("uses exact routes only when the required demo role is active", () => {
    const requirements = buildProofRequirements("");
    const controlRoom = requirements.find((item) => item.id === "control-room")!;
    const resources = requirements.find((item) => item.id === "resources")!;
    const organizer = { eventSlug: "demo-workspace-1", activeRole: "organizer" as const };
    expect(resolveProofDestination(controlRoom, organizer).route).toBe("/events/demo-workspace-1/dashboard");
    expect(resolveProofDestination(resources, organizer)).toMatchObject({
      route: "/demo?proof=resources",
      createsContext: true,
    });
    expect(resolveProofDestination(resources, { ...organizer, activeRole: "speaker" }).route).toBe("/portal/resources");
  });

  it("keeps video evidence pending until the complete accessible media package exists", () => {
    expect(readWalkthroughMedia({ videoUrl: "/demo/walkthrough.mp4" })).toMatchObject({
      isPublished: false,
      missing: ["poster", "captions", "transcript"],
    });
    expect(readWalkthroughMedia({
      videoUrl: "/demo/walkthrough.mp4",
      posterUrl: "/demo/walkthrough-poster.webp",
      captionsUrl: "/demo/walkthrough.vtt",
      transcriptUrl: "/demo/walkthrough-transcript.html",
    })).toMatchObject({ isPublished: true, missing: [] });
  });

  it("rejects unsafe media URLs", () => {
    expect(readWalkthroughMedia({
      videoUrl: "javascript:alert(1)",
      posterUrl: "//untrusted.example/poster.webp",
      captionsUrl: "https://media.namos-sessions.xyz/walkthrough.vtt",
      transcriptUrl: "/demo/transcript.html",
    })).toMatchObject({
      videoUrl: undefined,
      posterUrl: undefined,
      isPublished: false,
      missing: ["video", "poster"],
    });
  });
});
