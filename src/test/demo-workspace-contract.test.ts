import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("demo workspace server boundary", () => {
  it("keeps lifecycle mutations behind Worker secrets while production demo entry is enabled", () => {
    const worker = readFileSync(resolve(process.cwd(), "worker/demo.ts"), "utf8");
    const convexHttp = readFileSync(resolve(process.cwd(), "convex/http.ts"), "utf8");
    const config = readFileSync(resolve(process.cwd(), "wrangler.jsonc"), "utf8");
    expect(worker).toContain('env.DEMO_ENABLED === "true"');
    expect(worker).toContain("HttpOnly; Secure; SameSite=Lax");
    expect(worker).toContain('request.headers.get("x-demo-csrf")');
    expect(convexHttp).toContain('request.headers.get("x-namos-demo-secret")');
    expect(config).toContain('"DEMO_ENABLED": "true"');
  });

  it("never exposes the Clerk secret or workspace role-user mapping to browser responses", () => {
    const worker = readFileSync(resolve(process.cwd(), "worker/demo.ts"), "utf8");
    expect(worker).not.toMatch(/json\([^\n]+CLERK_SECRET_KEY/);
    expect(worker).toContain("userIds: undefined");
  });

  it("seeds and fully reseeds the judge workflow with exact Clerk-linked identities", () => {
    const fixture = readFileSync(resolve(process.cwd(), "convex/demoWorkspaces.ts"), "utf8");
    expect(fixture).toContain('status: "published"');
    expect(fixture).toContain('internalName: "Judge walkthrough CFP"');
    expect(fixture).toContain("showIf: { fieldId: String(formatFieldId), equals: \"Workshop\" }");
    expect(fixture).toContain("reviewerUserIds: [reviewerUserId]");
    expect(fixture).toContain('sourceRef: "demo:seed:pending"');
    expect(fixture).toContain('status: "accepted"');
    expect(fixture).toContain('title: "Upload final slides"');
    expect(fixture).toContain('name: "Reviewed acceptance"');
    expect(fixture).toContain("await deleteDemoFixture(ctx, workspace.eventId, workspace.organizerUserId)");
    expect(fixture).toContain("await seedDemoFixture(ctx, { eventId: workspace.eventId");
  });

  it("captures all demo email before integration resolution and grants only a bounded agent allowance", () => {
    const delivery = readFileSync(resolve(process.cwd(), "convex/emailDelivery.ts"), "utf8");
    const allowance = readFileSync(resolve(process.cwd(), "convex/agentBillingResolver.ts"), "utf8");
    const capturePosition = delivery.indexOf("captureDeliveryForEvent");
    const providerPosition = delivery.indexOf("const integration = await resolveEventIntegration", capturePosition);
    expect(capturePosition).toBeGreaterThan(0);
    expect(providerPosition).toBeGreaterThan(capturePosition);
    expect(allowance).toContain('namosDemoRole === "organizer"');
    expect(allowance).toContain('planSlug: "demo", runLimit: 3, tokenLimit: 30_000, reserveTokens: 10_000');
  });
});
