import { describe, expect, it } from "vitest";
import { hasUsableManagedOpenAiKey } from "../../convex/agentProviderConfig";

describe("managed Agent provider configuration", () => {
  it("rejects missing and development placeholder keys before a run starts", () => {
    expect(hasUsableManagedOpenAiKey(undefined)).toBe(false);
    expect(hasUsableManagedOpenAiKey("sk-placeholder-for-local-dev-only")).toBe(false);
    expect(hasUsableManagedOpenAiKey("replace-me")).toBe(false);
  });

  it("accepts a non-placeholder secret without exposing or parsing it", () => {
    expect(hasUsableManagedOpenAiKey("configured-secret-value")).toBe(true);
  });
});
