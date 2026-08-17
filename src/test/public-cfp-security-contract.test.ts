import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { api, internal } from "../../convex/_generated/api";

const publicFormsSource = readFileSync(join(process.cwd(), "convex/publicForms.ts"), "utf8");
const transportSource = readFileSync(join(process.cwd(), "src/data/convex/index.ts"), "utf8");
type HasSubmit<T> = "submit" extends keyof T ? true : false;
const publicApiHasCallableSubmit: HasSubmit<typeof api.publicForms> = false;
const internalApiHasCallableSubmit: HasSubmit<typeof internal.publicForms> = true;

describe("public CFP write boundary", () => {
  it("keeps the persistent write internal and removes the direct Convex transport mapping", () => {
    expect(publicApiHasCallableSubmit).toBe(false);
    expect(internalApiHasCallableSubmit).toBe(true);
    expect(publicFormsSource).toContain("export const submit = internalMutation(");
    expect(publicFormsSource).not.toContain("export const submit = mutation(");
    expect(transportSource).not.toContain('"publicForms.submit": "publicForms:submit"');
    expect(transportSource).toContain('fetch("/api/public/cfp-submissions"');
  });
});
