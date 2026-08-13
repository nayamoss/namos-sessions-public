import { describe, expect, it } from "vitest";
import { validateImportRows } from "@/pages/onboarding/importCsv";

describe("onboarding CSV preview validation", () => {
  it("keeps valid rows and explains invalid rows without blocking import", () => {
    const result = validateImportRows([
      { firstName: "Ada", lastName: "Lovelace", email: "ADA@example.test", talkTitle: "Analytical engines" },
      { firstName: "Grace", lastName: "Hopper", email: "not-an-email" },
    ]);
    expect(result.error).toBeUndefined();
    expect(result.rows[0]).toMatchObject({ email: "ADA@example.test", talkTitle: "Analytical engines" });
    expect(result.rows[1].error).toBe("Enter a valid email address.");
  });

  it("rejects files over the 500-row limit before a network call", () => {
    const result = validateImportRows(Array.from({ length: 501 }, () => ({ firstName: "Ada", lastName: "Lovelace", email: "ada@example.test" })));
    expect(result.rows).toEqual([]);
    expect(result.error).toContain("501 rows; the limit is 500");
  });
});
