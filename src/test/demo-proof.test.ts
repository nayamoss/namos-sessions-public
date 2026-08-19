import { describe, expect, it } from "vitest";
import { buildProofRequirements } from "@/lib/demo-proof";

describe("demo proof evidence", () => {
  it("defaults every requirement to NOT RUN instead of fabricating passes", () => {
    expect(buildProofRequirements("").every((item) => item.status === "NOT RUN")).toBe(true);
  });

  it("requires both a test name and direct route before displaying PASS", () => {
    const withoutTest = buildProofRequirements(JSON.stringify([{ id: "role-entry", status: "PASS" }]));
    expect(withoutTest[0].status).toBe("NOT RUN");
    const verified = buildProofRequirements(JSON.stringify([{ id: "role-entry", status: "PASS", testName: "demo entry e2e", proofRoute: "/demo#roles" }]));
    expect(verified[0]).toMatchObject({ status: "PASS", testName: "demo entry e2e", proofRoute: "/demo#roles" });
  });

  it("rejects external proof-route overrides", () => {
    const result = buildProofRequirements(JSON.stringify([{ id: "role-entry", status: "PASS", testName: "demo entry e2e", proofRoute: "https://untrusted.example" }]));
    expect(result[0].proofRoute).toBe("/demo#roles");
    const protocolRelative = buildProofRequirements(JSON.stringify([{ id: "role-entry", status: "PASS", testName: "demo entry e2e", proofRoute: "//untrusted.example" }]));
    expect(protocolRelative[0].proofRoute).toBe("/demo#roles");
  });
});
